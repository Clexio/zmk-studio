import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { AvailableDevice } from ".";

export async function list_devices(): Promise<Array<AvailableDevice>> {
  return await invoke("serial_list_devices");
}

export async function connect(dev: AvailableDevice): Promise<RpcTransport> {
  if (!(await invoke("serial_connect", dev))) {
    throw new Error("Failed to connect");
  }

  let abortController = new AbortController();

  let writable = new WritableStream({
    async write(chunk, _controller) {
      await invoke("transport_send_data", new Uint8Array(chunk));
    },
  });

  let { writable: response_writable, readable } = new TransformStream();

  // 串口数据可能连续快速到达。每个事件都直接 getWriter() 会因上一个
  // writer 尚未释放而抛错，导致数据块丢失（大响应如层数据在 macOS 上
  // 特别容易触发）。这里用 promise 链保证同一时间只有一个 writer，
  // 且严格按到达顺序写入。
  let write_chain: Promise<void> = Promise.resolve();
  const unlisten_data = await listen(
    "connection_data",
    (event: { payload: Array<number> }) => {
      write_chain = write_chain
        .then(async () => {
          let writer = response_writable.getWriter();
          try {
            await writer.write(new Uint8Array(event.payload));
          } finally {
            writer.releaseLock();
          }
        })
        .catch((e) => {
          // 单块写入失败不能中断整条链，否则后续数据块会全部丢失
          console.error("connection_data write failed", e);
        });
    }
  );

  const unlisten_disconnected = await listen(
    "connection_disconnected",
    async (_ev: any) => {
      unlisten_data();
      unlisten_disconnected();
      write_chain = write_chain
        .then(() => response_writable.close())
        .catch(() => response_writable.close());
    }
  );

  let signal = abortController.signal;

  let abort_cb = async (_reason: any) => {
    unlisten_data();
    unlisten_disconnected();
    await invoke("transport_close");
    signal.removeEventListener("abort", abort_cb);
  };

  signal.addEventListener("abort", abort_cb);

  return { label: dev.label, abortController, readable, writable };
}

import React, { SetStateAction, useContext, useEffect, useState } from "react";
import { ConnectionContext } from "./ConnectionContext";

import { call_rpc } from "./logging";

import { Request, RequestResponse } from "@zmkfirmware/zmk-studio-ts-client";
import { LockStateContext } from "./LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";

export function useConnectedDeviceData<T>(
  req: Omit<Request, "requestId">,
  response_mapper: (resp: RequestResponse) => T | undefined,
  requireUnlock?: boolean
): [T | undefined, React.Dispatch<SetStateAction<T | undefined>>] {
  let connection = useContext(ConnectionContext);
  let lockState = useContext(LockStateContext);
  let [data, setData] = useState<T | undefined>(undefined);

  useEffect(
    () => {
      if (
        !connection.conn ||
        (requireUnlock &&
          lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED)
      ) {
        setData(undefined);
        return;
      }

      async function startRequest() {
        setData(undefined);
        if (!connection.conn) {
          return;
        }

        // 读取型请求（层数据/布局/旋钮参数）失败时自动重试，
        // 避免串口偶发丢包导致界面一直空白（例如 macOS 上大响应被拆分）。
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            let response = response_mapper(
              await call_rpc(connection.conn, req)
            );
            if (!ignore) {
              setData(response);
            }
            return;
          } catch (e) {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 500));
            } else {
              console.error("RPC request failed after retries", req, e);
            }
          }
        }
      }

      let ignore = false;
      startRequest();

      return () => {
        ignore = true;
      };
    },
    requireUnlock
      ? [connection, requireUnlock, lockState]
      : [connection, requireUnlock]
  );

  return [data, setData];
}

import { useI18n } from "./i18n";

export interface AppFooterProps {
  onShowLicenseNotice: () => void;
}

export const AppFooter = ({ onShowLicenseNotice }: AppFooterProps) => {
  const { t } = useI18n();
  return (
    <div className="grid justify-center p-1 bg-base-200">
      <div>
        <span>&copy; 2026 - Improved based on ZMK</span> -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowLicenseNotice}>
          {t("licenseNotice")}
        </a>
      </div>
    </div>
  );
};

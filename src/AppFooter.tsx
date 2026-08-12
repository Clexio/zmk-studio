import { useI18n } from "./i18n";

export interface AppFooterProps {
  onShowAbout: () => void;
  onShowLicenseNotice: () => void;
}

export const AppFooter = ({
  onShowAbout,
  onShowLicenseNotice,
}: AppFooterProps) => {
  const { t } = useI18n();
  return (
    <div className="grid justify-center p-1 bg-base-200">
      <div>
        <span>&copy; 2026 - The ZMK Contributors</span> -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowAbout}>
          {t("aboutZmkStudio")}
        </a>{" "}
        -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowLicenseNotice}>
          {t("licenseNotice")}
        </a>
      </div>
    </div>
  );
};

import { Outlet } from "react-router";
import { NavigationProgress } from "~/components/navigation-progress";
import { EnvironmentBanner, SiteFooter, SiteHeader, SkipLink } from "~/components/site-chrome";
import { useRootData } from "~/root";

export default function PublicLayout() {
  const root = useRootData();
  return (
    <>
      <SkipLink />
      <NavigationProgress />
      <EnvironmentBanner appEnv={root?.appEnv ?? "production"} />
      <SiteHeader viewer={root?.viewer ?? null} />
      <Outlet />
      <SiteFooter />
    </>
  );
}

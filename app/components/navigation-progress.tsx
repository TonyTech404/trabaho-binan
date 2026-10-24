import { useNavigation } from "react-router";

/** A thin bar at the top of the page while the next page loads. */
export function NavigationProgress() {
  const navigation = useNavigation();
  const active = navigation.state !== "idle";
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-1 origin-left bg-pine transition-[transform,opacity] duration-500 ${active ? "scale-x-75 opacity-100" : "scale-x-0 opacity-0"}`}
    />
  );
}

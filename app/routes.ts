import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Public site
  layout("routes/public-layout.tsx", [
    index("routes/home.tsx"),
    route("jobs/:publicId/:slug?", "routes/job.tsx"),
    route("employers/:slug", "routes/employer-profile.tsx"),
    route("report/:publicId", "routes/report.tsx"),
    route("help", "routes/help.tsx"),
    route("privacy", "routes/privacy.tsx"),
    route("login", "routes/login.tsx"),
  ]),

  route("apply/:publicId", "routes/apply.ts"),
  route("api/job-view/:publicId", "routes/api.job-view.ts"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("logout", "routes/logout.tsx"),
  route("healthz", "routes/healthz.ts"),
] satisfies RouteConfig;

import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

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
    route("forgot-password", "routes/forgot-password.tsx"),
    route("invite/:token", "routes/invite.tsx"),
    route("reset-password/:token", "routes/reset-password.tsx"),
  ]),

  // Reviewers and administrators
  ...prefix("manage", [
    layout("routes/manage/layout.tsx", [
      index("routes/manage/index.tsx"),
      route("review", "routes/manage/review.tsx"),
      route("jobs", "routes/manage/jobs.tsx"),
      route("jobs/new", "routes/manage/job-new.tsx"),
      route("jobs/:jobId", "routes/manage/job.tsx"),
      route("jobs/:jobId/edit", "routes/manage/job-edit.tsx"),
      route("employers", "routes/manage/employers.tsx"),
      route("employers/new", "routes/manage/employer-new.tsx"),
      route("employers/:organizationId", "routes/manage/employer.tsx"),
      route("reports", "routes/manage/reports.tsx"),
      route("users", "routes/manage/users.tsx"),
      route("audit", "routes/manage/audit.tsx"),
      route("settings", "routes/manage/settings.tsx"),
    ]),
    route("export.csv", "routes/manage/export.ts"),
  ]),

  // Invited employers
  ...prefix("employer", [
    layout("routes/employer/layout.tsx", [
      index("routes/employer/index.tsx"),
      route("jobs/new", "routes/employer/job-new.tsx"),
      route("jobs/:jobId", "routes/employer/job.tsx"),
      route("jobs/:jobId/edit", "routes/employer/job-edit.tsx"),
      route("profile", "routes/employer/profile.tsx"),
    ]),
  ]),

  route("account", "routes/account.tsx"),
  route("apply/:publicId", "routes/apply.ts"),
  route("api/job-view/:publicId", "routes/api.job-view.ts"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("logout", "routes/logout.tsx"),
  route("healthz", "routes/healthz.ts"),
] satisfies RouteConfig;

import { Composition } from "remotion";
import { DemoVideo, type DemoProps } from "./DemoVideo";
import { FPS, SIZE, type Format } from "./theme";
import { buildTimeline, type VideoId } from "./timeline";

const VIDEOS: VideoId[] = ["jobseeker", "backoffice"];
const FORMATS: Format[] = ["desktop", "mobile"];

export function Root() {
  return (
    <>
      {VIDEOS.flatMap((video) =>
        FORMATS.map((format) => (
          <Composition
            key={`${video}-${format}`}
            id={`${video}-${format}`}
            component={DemoVideo}
            defaultProps={{ video, format } satisfies DemoProps}
            fps={FPS}
            width={SIZE[format].width}
            height={SIZE[format].height}
            durationInFrames={buildTimeline(video, format).total}
          />
        )),
      )}
    </>
  );
}

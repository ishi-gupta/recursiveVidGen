import { NextRequest, NextResponse } from "next/server";
import RunwayML from "@runwayml/sdk";

const client = new RunwayML({
  apiKey: process.env.RUNWAYML_API_SECRET,
});

export async function POST(req: NextRequest) {
  try {
    const { frontImage, backgroundImage } = await req.json();

    if (!frontImage || !backgroundImage) {
      return NextResponse.json(
        { error: "Front image and background image are required" },
        { status: 400 }
      );
    }

    // Kick off both video generation tasks and poll for completion in parallel
    // waitForTaskOutput is available on the un-awaited promise from create()
    const [settingResult, personResult] = await Promise.all([
      // Task 1: Cinematic pan through the setting/background
      client.imageToVideo
        .create({
          model: "gen4_turbo",
          promptImage: backgroundImage,
          promptText:
            "Slow cinematic pan across this scene, smooth camera movement, atmospheric lighting, high quality",
          ratio: "1280:720",
          duration: 10,
        })
        .waitForTaskOutput({ timeout: 10 * 60 * 1000 }),

      // Task 2: Person animated/talking in front of background
      client.imageToVideo
        .create({
          model: "gen4_turbo",
          promptImage: frontImage,
          promptText:
            "Person talking naturally and expressively, subtle head movements, natural facial expressions, cinematic lighting",
          ratio: "1280:720",
          duration: 10,
        })
        .waitForTaskOutput({ timeout: 10 * 60 * 1000 }),
    ]);

    return NextResponse.json({
      settingVideoUrl: settingResult.output?.[0] ?? null,
      personVideoUrl: personResult.output?.[0] ?? null,
    });
  } catch (error: unknown) {
    console.error("Runway generation error:", error);
    const message =
      error instanceof Error ? error.message : "Video generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

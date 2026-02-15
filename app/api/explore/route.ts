import { NextRequest, NextResponse } from "next/server";
import RunwayML from "@runwayml/sdk";

const client = new RunwayML({
  apiKey: process.env.RUNWAYML_API_SECRET,
});

export async function POST(req: NextRequest) {
  try {
    const { image, prompt } = await req.json();

    if (!image || !prompt) {
      return NextResponse.json(
        { error: "Image and prompt are required" },
        { status: 400 }
      );
    }

    const result = await client.imageToVideo
      .create({
        model: "gen4_turbo",
        promptImage: image,
        promptText: prompt,
        ratio: "1280:720",
        duration: 10,
      })
      .waitForTaskOutput({ timeout: 10 * 60 * 1000 });

    return NextResponse.json({
      videoUrl: result.output?.[0] ?? null,
    });
  } catch (error: unknown) {
    console.error("Runway explore error:", error);
    const message =
      error instanceof Error ? error.message : "Video generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

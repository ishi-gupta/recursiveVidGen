"use client";

import { useState, useRef, ChangeEvent } from "react";

type ImageSlot = {
  label: string;
  key: string;
  file: File | null;
  preview: string | null;
};

type TaskStatus = "idle" | "uploading" | "generating" | "polling" | "done" | "error";

export default function Home() {
  const [images, setImages] = useState<ImageSlot[]>([
    { label: "Front", key: "front", file: null, preview: null },
    { label: "Left", key: "left", file: null, preview: null },
    { label: "Right", key: "right", file: null, preview: null },
    { label: "Back", key: "back", file: null, preview: null },
    { label: "Background / Setting", key: "background", file: null, preview: null },
  ]);

  const [status, setStatus] = useState<TaskStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [videos, setVideos] = useState<{ setting: string; person: string } | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleImageSelect = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImages((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], file, preview: reader.result as string };
        return updated;
      });
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], file: null, preview: null };
      return updated;
    });
    if (fileInputRefs.current[index]) {
      fileInputRefs.current[index]!.value = "";
    }
  };

  const allRequiredUploaded = images[0].file && images[4].file;

  const handleGenerate = async () => {
    if (!allRequiredUploaded) return;

    setStatus("uploading");
    setStatusMessage("Preparing images...");
    setVideos(null);

    try {
      const toDataURI = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

      const frontURI = await toDataURI(images[0].file!);
      const backgroundURI = await toDataURI(images[4].file!);

      setStatus("generating");
      setStatusMessage("Sending to Runway ML... This may take a few minutes.");

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontImage: frontURI,
          backgroundImage: backgroundURI,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }

      setStatus("polling");
      setStatusMessage("Videos are being generated... Polling for results.");

      const data = await res.json();
      setVideos({ setting: data.settingVideoUrl, person: data.personVideoUrl });
      setStatus("done");
      setStatusMessage("Videos generated successfully!");
    } catch (err: unknown) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "An error occurred");
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Runway Video Generator</h1>
        <p className="text-gray-400 mb-8">
          Upload profile photos and a background image to generate cinematic videos.
        </p>

        {/* Person Photos */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Person Photos</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {images.slice(0, 4).map((slot, i) => (
              <div key={slot.key} className="relative">
                <input
                  ref={(el) => { fileInputRefs.current[i] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageSelect(i, e)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[i]?.click()}
                  className="w-full aspect-square rounded-xl border-2 border-dashed border-gray-600 hover:border-gray-400 transition-colors flex flex-col items-center justify-center overflow-hidden bg-gray-900"
                >
                  {slot.preview ? (
                    <img src={slot.preview} alt={slot.label} className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <svg className="w-8 h-8 text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-sm text-gray-500">{slot.label}</span>
                    </>
                  )}
                </button>
                {slot.preview && (
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 rounded-full w-6 h-6 flex items-center justify-center text-xs"
                  >
                    X
                  </button>
                )}
                <p className="text-center text-sm text-gray-400 mt-1">
                  {slot.label} {i === 0 && <span className="text-red-400">*</span>}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Background Image */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Background / Setting Image <span className="text-red-400">*</span></h2>
          <div className="max-w-md">
            <input
              ref={(el) => { fileInputRefs.current[4] = el; }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImageSelect(4, e)}
            />
            <button
              type="button"
              onClick={() => fileInputRefs.current[4]?.click()}
              className="w-full aspect-video rounded-xl border-2 border-dashed border-gray-600 hover:border-gray-400 transition-colors flex flex-col items-center justify-center overflow-hidden bg-gray-900"
            >
              {images[4].preview ? (
                <img src={images[4].preview} alt="Background" className="w-full h-full object-cover" />
              ) : (
                <>
                  <svg className="w-10 h-10 text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-gray-500">Upload background image</span>
                </>
              )}
            </button>
            {images[4].preview && (
              <button
                onClick={() => removeImage(4)}
                className="mt-2 text-sm text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            )}
          </div>
        </section>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!allRequiredUploaded || (status !== "idle" && status !== "done" && status !== "error")}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-lg transition-colors"
        >
          {status === "generating" || status === "polling" ? "Generating..." : "Generate Videos"}
        </button>

        {/* Status */}
        {status !== "idle" && (
          <div className={`mt-4 p-4 rounded-lg ${status === "error" ? "bg-red-900/50 text-red-300" : status === "done" ? "bg-green-900/50 text-green-300" : "bg-gray-800 text-gray-300"}`}>
            {(status === "generating" || status === "polling" || status === "uploading") && (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 align-middle" />
            )}
            {statusMessage}
          </div>
        )}

        {/* Video Results */}
        {videos && (
          <section className="mt-10">
            <h2 className="text-2xl font-semibold mb-6">Generated Videos</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Setting Pan</h3>
                <video src={videos.setting} controls className="w-full rounded-lg bg-black" />
                <a
                  href={videos.setting}
                  download="setting-video.mp4"
                  className="inline-block mt-2 text-sm text-indigo-400 hover:text-indigo-300"
                >
                  Download
                </a>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Person Animated</h3>
                <video src={videos.person} controls className="w-full rounded-lg bg-black" />
                <a
                  href={videos.person}
                  download="person-video.mp4"
                  className="inline-block mt-2 text-sm text-indigo-400 hover:text-indigo-300"
                >
                  Download
                </a>
              </div>
            </div>
          </section>
        )}

        <p className="text-gray-600 text-sm mt-12">* Required fields. Front photo and background image are required at minimum.</p>
      </div>
    </main>
  );
}

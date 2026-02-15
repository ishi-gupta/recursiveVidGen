"use client";

import { useState, useRef, useCallback, ChangeEvent } from "react";

type ImageSlot = {
  label: string;
  key: string;
  file: File | null;
  preview: string | null;
};

type TaskStatus = "idle" | "uploading" | "generating" | "polling" | "done" | "error";

type ExploreNode = {
  id: string;
  prompt: string;
  frameImage: string; // base64 data URI of the captured frame
  videoUrl: string;
};

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

  // Explore state
  const [exploreChain, setExploreChain] = useState<ExploreNode[]>([]);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [explorePrompt, setExplorePrompt] = useState("");
  const [exploreStatus, setExploreStatus] = useState<TaskStatus>("idle");
  const [exploreMessage, setExploreMessage] = useState("");
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});

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
    setExploreChain([]);
    setCapturedFrame(null);

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
      setStatusMessage("Videos generated successfully! Pause a video and click it to explore.");
    } catch (err: unknown) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "An error occurred");
    }
  };

  // Capture the current frame from a video element
  const captureFrame = useCallback((videoEl: HTMLVideoElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoEl, 0, 0);
    const dataUri = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedFrame(dataUri);
    setExplorePrompt("");
  }, []);

  // Handle clicking on a video to capture frame (only when paused)
  const handleVideoClick = useCallback((videoEl: HTMLVideoElement | null) => {
    if (!videoEl || !videoEl.paused) return;
    captureFrame(videoEl);
  }, [captureFrame]);

  // Submit an explore request
  const handleExplore = async () => {
    if (!capturedFrame || !explorePrompt.trim()) return;

    setExploreStatus("generating");
    setExploreMessage("Generating new video from this frame... This may take a few minutes.");

    try {
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: capturedFrame,
          prompt: explorePrompt.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Explore generation failed");
      }

      setExploreStatus("polling");
      setExploreMessage("Video is being generated... Polling for results.");

      const data = await res.json();

      if (!data.videoUrl) {
        throw new Error("No video URL returned");
      }

      const newNode: ExploreNode = {
        id: crypto.randomUUID(),
        prompt: explorePrompt.trim(),
        frameImage: capturedFrame,
        videoUrl: data.videoUrl,
      };

      setExploreChain((prev) => [...prev, newNode]);
      setCapturedFrame(null);
      setExplorePrompt("");
      setExploreStatus("done");
      setExploreMessage("Exploration video generated! Pause and click to go deeper.");
    } catch (err: unknown) {
      setExploreStatus("error");
      setExploreMessage(err instanceof Error ? err.message : "An error occurred");
    }
  };

  // Navigate breadcrumb — truncate chain to that index
  const navigateTo = (index: number) => {
    setExploreChain((prev) => prev.slice(0, index + 1));
    setCapturedFrame(null);
    setExplorePrompt("");
    setExploreStatus("idle");
    setExploreMessage("");
  };

  const goToRoot = () => {
    setExploreChain([]);
    setCapturedFrame(null);
    setExplorePrompt("");
    setExploreStatus("idle");
    setExploreMessage("");
  };

  // Determine what video to show in the explore view
  const currentExploreVideo = exploreChain.length > 0
    ? exploreChain[exploreChain.length - 1].videoUrl
    : null;

  const isExploring = exploreChain.length > 0 || capturedFrame;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Runway Video Generator</h1>
        <p className="text-gray-400 mb-8">
          Upload profile photos and a background image to generate cinematic videos.
          Then explore the world by pausing and clicking on any video.
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
        {videos && !isExploring && (
          <section className="mt-10">
            <h2 className="text-2xl font-semibold mb-6">Generated Videos</h2>
            <p className="text-gray-400 text-sm mb-4">Pause a video and click on it to capture a frame and explore deeper.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Setting Pan</h3>
                <video
                  ref={(el) => { videoRefs.current["setting"] = el; }}
                  src={videos.setting}
                  controls
                  crossOrigin="anonymous"
                  className="w-full rounded-lg bg-black cursor-pointer"
                  onClick={() => handleVideoClick(videoRefs.current["setting"])}
                />
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
                <video
                  ref={(el) => { videoRefs.current["person"] = el; }}
                  src={videos.person}
                  controls
                  crossOrigin="anonymous"
                  className="w-full rounded-lg bg-black cursor-pointer"
                  onClick={() => handleVideoClick(videoRefs.current["person"])}
                />
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

        {/* Exploration View */}
        {videos && isExploring && (
          <section className="mt-10">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 mb-6 flex-wrap text-sm">
              <button
                onClick={goToRoot}
                className="text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Original Videos
              </button>
              {exploreChain.map((node, i) => (
                <span key={node.id} className="flex items-center gap-2">
                  <span className="text-gray-600">/</span>
                  <button
                    onClick={() => navigateTo(i)}
                    className={`max-w-[200px] truncate ${
                      i === exploreChain.length - 1
                        ? "text-white font-medium"
                        : "text-indigo-400 hover:text-indigo-300"
                    }`}
                  >
                    {node.prompt}
                  </button>
                </span>
              ))}
            </nav>

            {/* Current explore video */}
            {currentExploreVideo && (
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">
                  {exploreChain[exploreChain.length - 1].prompt}
                </h3>
                <video
                  ref={(el) => { videoRefs.current["explore"] = el; }}
                  src={currentExploreVideo}
                  controls
                  crossOrigin="anonymous"
                  className="w-full max-w-2xl rounded-lg bg-black cursor-pointer"
                  onClick={() => handleVideoClick(videoRefs.current["explore"])}
                />
                <p className="text-gray-400 text-sm mt-2">Pause and click to explore further.</p>
              </div>
            )}

            {/* Captured frame + prompt input */}
            {capturedFrame && (
              <div className="mt-6 p-6 bg-gray-900 rounded-xl border border-gray-800">
                <h3 className="text-lg font-semibold mb-4">Explore this moment</h3>
                <div className="flex gap-6 flex-col md:flex-row">
                  <div className="shrink-0">
                    <p className="text-sm text-gray-400 mb-2">Captured frame:</p>
                    <img
                      src={capturedFrame}
                      alt="Captured frame"
                      className="w-64 rounded-lg border border-gray-700"
                    />
                    <button
                      onClick={() => setCapturedFrame(null)}
                      className="mt-2 text-sm text-red-400 hover:text-red-300"
                    >
                      Discard
                    </button>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-gray-400 mb-2">
                      Describe what you want to explore from this frame:
                    </label>
                    <textarea
                      value={explorePrompt}
                      onChange={(e) => setExplorePrompt(e.target.value)}
                      placeholder="e.g. Zoom into the castle in the distance, dramatic clouds rolling in..."
                      className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={handleExplore}
                      disabled={!explorePrompt.trim() || (exploreStatus !== "idle" && exploreStatus !== "done" && exploreStatus !== "error")}
                      className="mt-3 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                    >
                      {exploreStatus === "generating" || exploreStatus === "polling" ? "Generating..." : "Explore"}
                    </button>
                  </div>
                </div>

                {/* Explore status */}
                {exploreStatus !== "idle" && (
                  <div className={`mt-4 p-4 rounded-lg ${exploreStatus === "error" ? "bg-red-900/50 text-red-300" : exploreStatus === "done" ? "bg-green-900/50 text-green-300" : "bg-gray-800 text-gray-300"}`}>
                    {(exploreStatus === "generating" || exploreStatus === "polling") && (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                    )}
                    {exploreMessage}
                  </div>
                )}
              </div>
            )}

            {/* Exploration history thumbnails */}
            {exploreChain.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-medium text-gray-400 mb-3">Exploration path</h3>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {exploreChain.map((node, i) => (
                    <button
                      key={node.id}
                      onClick={() => navigateTo(i)}
                      className={`shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                        i === exploreChain.length - 1 ? "border-indigo-500" : "border-gray-700 hover:border-gray-500"
                      }`}
                    >
                      <img
                        src={node.frameImage}
                        alt={node.prompt}
                        className="w-24 h-16 object-cover"
                      />
                      <p className="text-xs text-gray-400 p-1 truncate w-24">{node.prompt}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <p className="text-gray-600 text-sm mt-12">* Required fields. Front photo and background image are required at minimum.</p>
      </div>
    </main>
  );
}

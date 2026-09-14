export const BLOCKED_OPENAI_KEY_MESSAGE =
  "BLOCKED: OPENAI_API_KEY is required to generate the final narrated MP4.";

function requireArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  return value;
}

function indexUnique(items, label) {
  const indexed = new Map();
  for (const item of items) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    if (!id) throw new Error(`${label} contains an entry without an ID.`);
    if (indexed.has(id)) throw new Error(`${label} contains duplicate ID: ${id}.`);
    indexed.set(id, item);
  }
  return indexed;
}

export function requireOpenAiApiKey(value) {
  const key = value?.trim();
  if (!key) throw new Error(BLOCKED_OPENAI_KEY_MESSAGE);
  return key;
}

export function segmentAudioFilename(index, id) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Audio segment index must be a non-negative integer.");
  }
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`Audio segment requires a safe segment ID: ${id}.`);
  }
  return `${String(index + 1).padStart(3, "0")}-${id}.mp3`;
}

export function audioDurationMsFromProbe(probeData) {
  const durationSeconds = Number(probeData?.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Audio media must have a positive duration.");
  }
  return Math.round(durationSeconds * 1000);
}

export function validateNarrationTimeline(narration, timeline) {
  if (narration?.language !== "vi") {
    throw new Error("Narration language must be vi.");
  }
  if (typeof narration?.voice !== "string" || !narration.voice.trim()) {
    throw new Error("Narration voice must be configured.");
  }

  const segments = requireArray(narration?.segments, "Narration segments");
  const timelineEntries = requireArray(timeline, "Timeline");
  const segmentsById = indexUnique(segments, "Narration segments");
  const timelineById = indexUnique(timelineEntries, "Timeline");

  for (const segment of segments) {
    if (typeof segment.text !== "string" || !segment.text.trim()) {
      throw new Error(`Narration text is missing for ID: ${segment.id}.`);
    }
    if (!timelineById.has(segment.id)) {
      throw new Error(`Timeline is missing narration ID: ${segment.id}.`);
    }
  }

  let previousEnd = -1;
  const mapped = timelineEntries.map((entry) => {
    const segment = segmentsById.get(entry.id);
    if (!segment) throw new Error(`Narration is missing timeline ID: ${entry.id}.`);
    if (segment.step !== entry.step) {
      throw new Error(`Narration step does not match timeline ID: ${entry.id}.`);
    }
    const startMs = Number(entry.startMs);
    const endMs = Number(entry.endMs);
    if (!Number.isFinite(startMs) || startMs < 0 || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error(`Timeline has invalid timestamps for ID: ${entry.id}.`);
    }
    if (startMs < previousEnd) {
      throw new Error(`Timeline overlaps before ID: ${entry.id}.`);
    }
    previousEnd = endMs;
    return {
      id: entry.id,
      step: entry.step,
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      text: segment.text.trim(),
    };
  });

  return mapped;
}

function validateAudioManifest(audioManifest, mappedTimeline) {
  const audioSegments = requireArray(audioManifest?.segments, "Audio manifest segments");
  const audioById = indexUnique(audioSegments, "Audio manifest segments");
  const timelineIds = new Set(mappedTimeline.map((entry) => entry.id));

  for (const audio of audioSegments) {
    if (!timelineIds.has(audio.id)) {
      throw new Error(`Timeline is missing audio ID: ${audio.id}.`);
    }
  }

  return mappedTimeline.map((entry) => {
    const audio = audioById.get(entry.id);
    if (!audio) throw new Error(`Audio manifest is missing timeline ID: ${entry.id}.`);
    const durationMs = Number(audio.durationMs);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error(`Audio duration must be positive for ID: ${entry.id}.`);
    }
    if (entry.startMs + durationMs > entry.endMs) {
      throw new Error(`Narration audio exceeds its visible timeline step for ID: ${entry.id}.`);
    }
    return { ...entry, durationMs: Math.round(durationMs), file: audio.file };
  });
}

export function buildSrtCues(narration, timeline, audioManifest, options = {}) {
  const readableTailMs = options.readableTailMs ?? 250;
  if (!Number.isFinite(readableTailMs) || readableTailMs < 0) {
    throw new Error("SRT readable tail must be a non-negative number.");
  }

  const mapped = validateAudioManifest(
    audioManifest,
    validateNarrationTimeline(narration, timeline),
  );

  return mapped.map((entry, index) => {
    const nextStartMs = mapped[index + 1]?.startMs;
    const naturalEndMs = entry.startMs + entry.durationMs + Math.round(readableTailMs);
    const endMs = Math.min(
      naturalEndMs,
      entry.endMs,
      nextStartMs === undefined ? Number.POSITIVE_INFINITY : nextStartMs - 1,
    );
    if (endMs <= entry.startMs) {
      throw new Error(`SRT cue has non-positive duration for ID: ${entry.id}.`);
    }
    return {
      index: index + 1,
      id: entry.id,
      startMs: entry.startMs,
      endMs,
      text: entry.text,
    };
  });
}

export function formatSrtTimestamp(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error("SRT timestamp must be a non-negative number.");
  }
  const total = Math.round(milliseconds);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const millis = total % 1_000;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":") + `,${String(millis).padStart(3, "0")}`;
}

export function renderSrt(cues) {
  return `${cues
    .map(
      (cue) =>
        `${cue.index}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}\n${cue.text}`,
    )
    .join("\n\n")}\n`;
}

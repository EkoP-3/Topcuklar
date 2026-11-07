import { clipLoader, clipUrls } from "./samples";

/**
 * Each Season 1 leader's line, shouted when their ultimate fires: on screen for everyone,
 * voiced where `src/assets/quotes/<id>.mp3` exists (ElevenLabs, one voice per leader).
 * Quotes come from the ancient and medieval sources named here; Mehmed's is Ottoman
 * tradition and Vlad's is a battle cry, not a recorded saying.
 */
export const QUOTES: Record<string, { text: string; source: string }> = {
  alexander: { text: "HEAVEN CANNOT HOLD TWO SUNS!", source: "Diodorus Siculus 17.54" },
  caesar: { text: "VENI, VIDI, VICI!", source: "Suetonius, Julius 37; Plutarch, Caesar 50" },
  cleopatra: {
    text: "I WILL NOT BE LED IN TRIUMPH!",
    source: "Livy, via Porphyrio on Horace, Odes 1.37",
  },
  genghis: {
    text: "I AM THE PUNISHMENT OF GOD!",
    source: "Juvaini, History of the World Conqueror",
  },
  leonidas: {
    text: "MOLON LABE! COME AND TAKE THEM!",
    source: "Plutarch, Sayings of Spartans 225c",
  },
  mehmed: { text: "EITHER I TAKE THIS CITY, OR IT TAKES ME!", source: "Ottoman tradition" },
  napoleon: {
    text: "IMPOSSIBLE IS NOT FRENCH!",
    source: "Letter to General Lemarois, 9 July 1813",
  },
  vlad: { text: "WALLACHIA WILL NEVER KNEEL!", source: "battle cry (not a recorded saying)" },
};

/** Decodes the recorded lines for an audio context (once). */
export const loadQuotes = clipLoader(
  clipUrls(
    import.meta.glob("../../assets/quotes/*.mp3", {
      eager: true,
      query: "?url",
      import: "default",
    }) as Record<string, string>,
  ),
);

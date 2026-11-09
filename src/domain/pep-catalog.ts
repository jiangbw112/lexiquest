/**
 * PEP grades 3–6, loaded apart from the forest sample.
 * Twenty ids also exist in forest-adventure.json. mergeWordFiles would refuse
 * that pair, and the forest chapter stays on the sample list until the
 * reference is decided. docs/pep/forest_chapter_mapping_v1.json is unused.
 */
import pepFile from "./pep/pep_words_g3-6_v1_loader.json";
import { readWordFile, type WordDef, type WordFile } from "./catalog";

export const PEP_WORD_FILE = pepFile as WordFile;
export const PEP_WORDS: WordDef[] = readWordFile(PEP_WORD_FILE, "pep_words_g3-6_v1_loader.json");

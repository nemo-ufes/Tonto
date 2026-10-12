// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * Colours that are not the model's.
 *
 * Nature fills come from the ontology and are the same everywhere -- a relator
 * is that green in any editor. Everything around them (paper, ink, rules) is the
 * reader's, and follows the editor's theme, which is one thing a diagram
 * rendered by a remote server could never do.
 */

export interface Theme {
  background: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  /** Ink on a nature fill, which stays light whatever the theme is. */
  onFill: string;
}

export const lightTheme: Theme = {
  background: "#f7f6f2",
  surface: "#ffffff",
  text: "#1f1c17",
  muted: "#6e6658",
  line: "#4a453c",
  accent: "#1f5c5c",
  onFill: "#1f1c17",
};

export const darkTheme: Theme = {
  background: "#1e1e1e",
  surface: "#252526",
  text: "#e8e6e1",
  muted: "#a29c91",
  line: "#c9c4bb",
  accent: "#6fd0c4",
  onFill: "#1f1c17",
};

export type PieceLetters = Record<string, string>;

export const localizeSan = (san: string, pieceLetters: PieceLetters): string =>
  san.replace(/[KQRBN]/g, (letter) => pieceLetters[letter] ?? letter);
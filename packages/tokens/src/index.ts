import tokens from "./tokens.json" with { type: "json" };

export type TokenCategory = "color" | "spacing" | "typography" | "radius" | "shadow";

export interface Token {
  name: string;
  value: string;
  category: TokenCategory;
  description: string;
}

export const allTokens: Token[] = tokens as Token[];

export function getTokensByCategory(category: TokenCategory): Token[] {
  return allTokens.filter(t => t.category === category);
}

export function getToken(name: string): Token | undefined {
  return allTokens.find(t => t.name === name);
}

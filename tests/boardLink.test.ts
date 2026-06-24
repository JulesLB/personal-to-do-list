import { describe, it, expect } from "vitest";
import { wantsBoardLink } from "../src/lib/boardLink";

describe("wantsBoardLink", () => {
  it("matches natural-language asks for the board", () => {
    const yes = [
      "board",
      "/board",
      "Board",
      "my board",
      "the board",
      "open board",
      "open my board",
      "Open the board",
      "see my board",
      "show me my board",
      "view my dashboard",
      "find my board",
      "send me the board link",
      "board link",
      "link to my board",
      "where's my board",
      "wheres my board",
      "where is my board",
      "where do i see my board",
      "where can i find my board?",
      "my dashboard",
      "open dashboard",
    ];
    for (const t of yes) expect(wantsBoardLink(t), t).toBe(true);
  });

  it("does not fire on real tasks that merely mention a board", () => {
    const no = [
      "prep the board meeting deck",
      "remind me about the board meeting tomorrow",
      "send the board pack to the directors",
      "buy a new ironing board",
      "the surfboard needs a new fin",
      "draft the quarterly dashboard report",
      "I need to brief the board on the budget",
      "",
      "what's overdue today",
    ];
    for (const t of no) expect(wantsBoardLink(t), t).toBe(false);
  });
});

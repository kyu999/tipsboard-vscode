import type { KanbanBoard, KanbanState } from "@/types";

function renumberColumn(board: KanbanBoard, columnId: string | null): void {
  const list = board.cards
    .filter((c) => (columnId === null ? c.column_id === null : c.column_id === columnId))
    .sort((a, b) => a.position - b.position);
  list.forEach((c, i) => {
    c.position = i;
  });
}

function cloneBoard(board: KanbanBoard): KanbanBoard {
  return {
    ...board,
    columns: board.columns.map((column) => ({ ...column })),
    cards: board.cards.map((card) => ({ ...card })),
  };
}

function applyMoveToBoard(
  board: KanbanBoard,
  notePath: string,
  toColumnId: string | null,
  position: number,
): void {
  const np = notePath.replace(/\\/g, "/");

  let card = board.cards.find((c) => c.note_path.replace(/\\/g, "/") === np);
  if (!card) {
    card = { note_path: np, column_id: toColumnId, position: 0 };
    board.cards.push(card);
  }

  const fromCol = card.column_id;
  card.column_id = toColumnId;

  const targetPeers = board.cards
    .filter((c) => c !== card && (toColumnId === null ? c.column_id === null : c.column_id === toColumnId))
    .sort((a, c) => a.position - c.position);

  const insertAt = Math.max(0, Math.min(Math.floor(position), targetPeers.length));
  const ordered = [...targetPeers.slice(0, insertAt), card, ...targetPeers.slice(insertAt)];
  ordered.forEach((c, i) => {
    c.position = i;
  });

  if (fromCol !== toColumnId) {
    renumberColumn(board, fromCol ?? null);
  }
}

export function applyMoveKanbanNoteInState(
  state: KanbanState,
  boardId: string,
  notePath: string,
  toColumnId: string | null,
  position: number,
): KanbanState {
  return {
    ...state,
    boards: state.boards.map((board) => {
      if (board.id !== boardId) return board;
      const nextBoard = cloneBoard(board);
      applyMoveToBoard(nextBoard, notePath, toColumnId, position);
      return nextBoard;
    }),
  };
}

export function applyMoveKanbanNotesInState(
  state: KanbanState,
  boardId: string,
  moves: ReadonlyArray<{ notePath: string; toColumnId: string | null; position: number }>,
): KanbanState {
  let next = state;
  for (const move of moves) {
    next = applyMoveKanbanNoteInState(next, boardId, move.notePath, move.toColumnId, move.position);
  }
  return next;
}

export function applyReorderKanbanColumnsInState(
  state: KanbanState,
  boardId: string,
  columnIds: readonly string[],
): KanbanState {
  return {
    ...state,
    boards: state.boards.map((board) => {
      if (board.id !== boardId) return board;
      const byId = new Map(board.columns.map((column) => [column.id, column] as const));
      const columns = columnIds
        .map((id, index) => {
          const column = byId.get(id);
          return column ? { ...column, position: index } : null;
        })
        .filter((column): column is NonNullable<typeof column> => column !== null);
      return { ...board, columns };
    }),
  };
}

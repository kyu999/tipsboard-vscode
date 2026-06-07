import { TextCanvasNode } from "@/components/canvas/nodes/TextCanvasNode";
import { NoteCanvasNode } from "@/components/canvas/nodes/NoteCanvasNode";
import { ImageCanvasNode } from "@/components/canvas/nodes/ImageCanvasNode";
import { LinkCanvasNode } from "@/components/canvas/nodes/LinkCanvasNode";
import { GroupCanvasNode } from "@/components/canvas/nodes/GroupCanvasNode";

export const canvasNodeTypes = {
  text: TextCanvasNode,
  note: NoteCanvasNode,
  image: ImageCanvasNode,
  link: LinkCanvasNode,
  group: GroupCanvasNode,
};

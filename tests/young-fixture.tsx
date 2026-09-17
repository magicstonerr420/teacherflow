import React from "react";
import { createRoot, type Root } from "react-dom/client";
import "../src/styles.css";
import { WorksheetHub } from "../src/components/lesson/WorksheetHub";
import { PresentationActions } from "../src/components/lesson/PresentationPanel";
export { default as JSZip } from "jszip";
let root: Root;
export function mount(data: any) {
  if (!root) {
    const div = document.createElement("div");
    document.body.replaceChildren(div);
    root = createRoot(div);
  }
  root.render(
    <>
      <WorksheetHub worksheet={data.lesson.worksheet} request={data.request} />
      <PresentationActions lesson={data.lesson} request={data.request} />
    </>,
  );
}

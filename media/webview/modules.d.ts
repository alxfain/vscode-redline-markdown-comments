declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";

  interface TaskListsOptions {
    /** Clickable checkboxes. The preview is read-only — `false`. */
    enabled?: boolean;
    /** Wrap the item text in a `<label>`. */
    label?: boolean;
    labelAfter?: boolean;
  }

  const taskLists: (md: MarkdownIt, options?: TaskListsOptions) => void;
  export default taskLists;
}

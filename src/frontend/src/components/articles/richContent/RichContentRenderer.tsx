import React, { useEffect, useMemo } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { createRichExtensions } from './extensions';
import type { RichDoc } from './richDoc';

interface RichContentRendererProps {
  doc: RichDoc;
}

const RichContentRenderer: React.FC<RichContentRendererProps> = ({ doc }) => {
  const extensions = useMemo(() => createRichExtensions(), []);
  const editor = useEditor({ extensions, content: doc, editable: false });

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(doc, { emitUpdate: false });
  }, [editor, doc]);

  return <EditorContent editor={editor} className="rich-content text-sm leading-relaxed text-slate-800 dark:text-slate-200" />;
};

export default RichContentRenderer;

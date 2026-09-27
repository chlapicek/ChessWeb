import React, { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorContent, useEditorState, type Editor } from '@tiptap/react';
import {
  AlertCircle, Bold, Heading2, Heading3, ImagePlus, Italic, Link as LinkIcon, List, ListOrdered, Minus, Paperclip,
  Quote, Redo2, SquareCode, Strikethrough, Underline, Undo2,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import type { Attachment } from '../../types';
import { apiErrorMessage } from './articleUtils';
import { isSafeLinkHref } from './richContent/extensions';
import { collectAttachmentIds } from './richContent/richDoc';

export const MAX_ARTICLE_ATTACHMENTS = 10;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'pgn', 'txt'];
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp';
const FILE_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

interface ArticleEditorProps {
  editor: Editor;
  existingAttachmentIds: string[];
  onAttachmentUploaded: (attachment: Attachment) => void;
}

const normalizeHref = (value: string) => {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const ArticleEditor: React.FC<ArticleEditorProps> = ({ editor, existingAttachmentIds, onAttachmentUploaded }) => {
  const { t } = useTranslation();
  const linkInputId = useId();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      h2: current.isActive('heading', { level: 2 }),
      h3: current.isActive('heading', { level: 3 }),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      blockquote: current.isActive('blockquote'),
      codeBlock: current.isActive('codeBlock'),
      link: current.isActive('link'),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  const openLink = () => {
    setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? '');
    setLinkError(null);
    setLinkOpen(true);
  };

  const applyLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = normalizeHref(linkUrl);
    if (!isSafeLinkHref(href)) {
      setLinkError(t('articles.linkInvalid'));
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setLinkOpen(false);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'file') => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadError(null);
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (!ALLOWED_EXTENSIONS.includes(extension) || (kind === 'image' && !imageExtensions.includes(extension))) {
      setUploadError(t('articles.uploadTypeNotAllowed'));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(t('articles.uploadTooLarge', { name: file.name }));
      return;
    }
    const used = new Set([...existingAttachmentIds.map((id) => id.toLowerCase()), ...collectAttachmentIds(editor.getJSON())]);
    if (used.size >= MAX_ARTICLE_ATTACHMENTS) {
      setUploadError(t('articles.attachmentLimit', { count: MAX_ARTICLE_ATTACHMENTS }));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post<Attachment>('/articles/attachments', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      onAttachmentUploaded(res.data);
      const node = kind === 'image'
        ? { type: 'attachmentImage', attrs: { attachmentId: res.data.id, alt: file.name.replace(/\.[^.]+$/, '').slice(0, 300) } }
        : { type: 'attachmentFile', attrs: { attachmentId: res.data.id } };
      editor.chain().focus().insertContent(node).run();
    } catch (error) {
      setUploadError(apiErrorMessage(error, t('articles.uploadFailed')));
    } finally {
      setUploading(false);
    }
  };

  const buttonClass = (active = false) =>
    `inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-slate-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 ${
      active ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'hover:bg-slate-200 dark:hover:bg-slate-800'
    }`;

  const markButton = (label: string, active: boolean, onClick: () => void, icon: React.ReactNode) => (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={buttonClass(active)}>
      {icon}
    </button>
  );
  const actionButton = (label: string, onClick: () => void, icon: React.ReactNode, disabled = false) => (
    <button type="button" onClick={onClick} aria-label={label} title={label} disabled={disabled} className={buttonClass()}>
      {icon}
    </button>
  );
  const icon = 'h-4 w-4';
  const separator = <span className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />;
  const chain = () => editor.chain().focus();

  return (
    <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
      <div role="toolbar" aria-label={t('articles.toolbar.label')} className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 dark:border-slate-800 p-1.5">
        {markButton(t('articles.toolbar.bold'), state.bold, () => chain().toggleBold().run(), <Bold className={icon} aria-hidden="true" />)}
        {markButton(t('articles.toolbar.italic'), state.italic, () => chain().toggleItalic().run(), <Italic className={icon} aria-hidden="true" />)}
        {markButton(t('articles.toolbar.underline'), state.underline, () => chain().toggleUnderline().run(), <Underline className={icon} aria-hidden="true" />)}
        {markButton(t('articles.toolbar.strike'), state.strike, () => chain().toggleStrike().run(), <Strikethrough className={icon} aria-hidden="true" />)}
        {separator}
        {markButton(t('articles.toolbar.heading2'), state.h2, () => chain().toggleHeading({ level: 2 }).run(), <Heading2 className={icon} aria-hidden="true" />)}
        {markButton(t('articles.toolbar.heading3'), state.h3, () => chain().toggleHeading({ level: 3 }).run(), <Heading3 className={icon} aria-hidden="true" />)}
        {markButton(t('articles.toolbar.bulletList'), state.bulletList, () => chain().toggleBulletList().run(), <List className={icon} aria-hidden="true" />)}
        {markButton(t('articles.toolbar.orderedList'), state.orderedList, () => chain().toggleOrderedList().run(), <ListOrdered className={icon} aria-hidden="true" />)}
        {markButton(t('articles.toolbar.blockquote'), state.blockquote, () => chain().toggleBlockquote().run(), <Quote className={icon} aria-hidden="true" />)}
        {markButton(t('articles.toolbar.codeBlock'), state.codeBlock, () => chain().toggleCodeBlock().run(), <SquareCode className={icon} aria-hidden="true" />)}
        {separator}
        {markButton(t('articles.toolbar.link'), state.link || linkOpen, openLink, <LinkIcon className={icon} aria-hidden="true" />)}
        {actionButton(t('articles.toolbar.horizontalRule'), () => chain().setHorizontalRule().run(), <Minus className={icon} aria-hidden="true" />)}
        {actionButton(t('articles.toolbar.insertImage'), () => imageInputRef.current?.click(), <ImagePlus className={icon} aria-hidden="true" />, uploading)}
        {actionButton(t('articles.toolbar.insertFile'), () => fileInputRef.current?.click(), <Paperclip className={icon} aria-hidden="true" />, uploading)}
        {separator}
        {actionButton(t('articles.toolbar.undo'), () => chain().undo().run(), <Undo2 className={icon} aria-hidden="true" />, !state.canUndo)}
        {actionButton(t('articles.toolbar.redo'), () => chain().redo().run(), <Redo2 className={icon} aria-hidden="true" />, !state.canRedo)}
        {uploading && <span className="ml-2 text-xs text-slate-500" role="status">{t('articles.uploading')}</span>}
      </div>

      <input ref={imageInputRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(event) => handleUpload(event, 'image')} aria-hidden="true" tabIndex={-1} />
      <input ref={fileInputRef} type="file" accept={FILE_ACCEPT} className="hidden" onChange={(event) => handleUpload(event, 'file')} aria-hidden="true" tabIndex={-1} />

      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 p-2">
          <label htmlFor={linkInputId} className="text-xs font-medium text-slate-600 dark:text-slate-300">{t('articles.linkUrl')}</label>
          <input
            id={linkInputId}
            type="url"
            autoFocus
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); applyLink(); }
              if (event.key === 'Escape') { event.preventDefault(); setLinkOpen(false); editor.commands.focus(); }
            }}
            placeholder="https://"
            aria-invalid={!!linkError}
            className="min-w-48 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button type="button" onClick={applyLink} className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
            {t('articles.linkApply')}
          </button>
          {state.link && (
            <button type="button" onClick={() => { chain().extendMarkRange('link').unsetLink().run(); setLinkOpen(false); }} className="rounded-md px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-rose-950/30">
              {t('articles.linkRemove')}
            </button>
          )}
          <button type="button" onClick={() => setLinkOpen(false)} className="rounded-md px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300 dark:hover:bg-slate-800">
            {t('common.cancel')}
          </button>
          {linkError && <p role="alert" className="w-full text-xs text-rose-600 dark:text-rose-400">{linkError}</p>}
        </div>
      )}

      {uploadError && (
        <div role="alert" className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {uploadError}
        </div>
      )}

      <EditorContent editor={editor} className="rich-content rich-content-editor max-h-[60vh] min-h-64 overflow-y-auto px-4 py-3 text-sm text-slate-800 dark:text-slate-200" />
    </div>
  );
};

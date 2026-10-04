import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Chessboard } from 'react-chessboard';
import { toast } from 'sonner';
import { Download, Eye, FileText, Swords, X } from 'lucide-react';
import { useArticleBoard } from './ArticleBoardContext';
import { MoveChip } from './MoveChip';
import { useAttachmentObjectUrl } from './useAttachmentObjectUrl';
import { downloadAttachment, formatFileSize, isValidFen } from '../articleUtils';

const actionClass = 'inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-300';

const RemoveButton: React.FC<Pick<NodeViewProps, 'editor' | 'deleteNode'>> = ({ editor, deleteNode }) => {
  const { t } = useTranslation();
  if (!editor.isEditable) return null;
  return (
    <button
      type="button"
      onClick={deleteNode}
      aria-label={t('articles.removeBlock')}
      title={t('articles.removeBlock')}
      className="absolute right-2 top-2 rounded-md bg-white/90 p-1 text-slate-500 shadow hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-slate-900/90"
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
};

const blockClass = (selected: boolean) =>
  `relative my-4 rounded-xl border bg-slate-50 p-3 dark:bg-slate-950 ${selected ? 'border-emerald-500 ring-2 ring-emerald-500/40' : 'border-slate-200 dark:border-slate-800'}`;

export const AttachmentImageView: React.FC<NodeViewProps> = ({ node, editor, deleteNode, selected }) => {
  const { t } = useTranslation();
  const attachmentId = node.attrs.attachmentId as string | undefined;
  const alt = (node.attrs.alt as string | null) ?? '';
  const { url, failed } = useAttachmentObjectUrl(attachmentId);

  return (
    <NodeViewWrapper as="figure" className={blockClass(selected)} contentEditable={false} data-attachment-image="">
      <RemoveButton editor={editor} deleteNode={deleteNode} />
      {url ? (
        <img src={url} alt={alt} className="mx-auto max-h-[32rem] max-w-full rounded-lg" />
      ) : (
        <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          {failed ? t('articles.imageUnavailable') : t('articles.loadingImage')}
          {failed && alt ? ` (${alt})` : ''}
        </p>
      )}
    </NodeViewWrapper>
  );
};

export const AttachmentFileView: React.FC<NodeViewProps> = ({ node, editor, deleteNode, selected }) => {
  const { t } = useTranslation();
  const { attachments } = useArticleBoard();
  const attachmentId = node.attrs.attachmentId as string;
  const attachment = attachments.find((item) => item.id.toLowerCase() === attachmentId?.toLowerCase());
  const fileName = attachment?.fileName ?? t('articles.attachment');
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await downloadAttachment(attachmentId, fileName);
    } catch {
      toast.error(t('articles.downloadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <NodeViewWrapper className={blockClass(selected)} contentEditable={false} data-attachment-file="">
      <RemoveButton editor={editor} deleteNode={deleteNode} />
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-label={t('articles.download', { name: fileName })}
        className="flex w-full items-center gap-3 rounded-lg p-1 pr-8 text-left hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:text-emerald-300"
      >
        <FileText className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm">{fileName}</span>
          {attachment && <span className="block text-[11px] text-slate-500 dark:text-slate-400">{formatFileSize(attachment.fileSizeBytes)}</span>}
        </span>
        <Download className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </button>
    </NodeViewWrapper>
  );
};

export const ChessPositionView: React.FC<NodeViewProps> = ({ node, editor, deleteNode, selected }) => {
  const { t } = useTranslation();
  const { showFen } = useArticleBoard();
  const boardId = `pos-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const fen = (node.attrs.fen as string) ?? '';
  const caption = node.attrs.caption as string | null;
  const valid = isValidFen(fen);

  return (
    <NodeViewWrapper as="figure" className={`${blockClass(selected)} flex flex-col items-center gap-2`} contentEditable={false} data-chess-position="">
      <RemoveButton editor={editor} deleteNode={deleteNode} />
      {valid ? (
        <div aria-label={caption ? t('articles.positionDiagramCaption', { caption }) : t('articles.positionDiagram')} role="img">
          <Chessboard options={{ id: boardId, position: fen, allowDragging: false, boardStyle: { width: 220 } }} />
        </div>
      ) : (
        <p className="font-mono text-xs text-rose-600 dark:text-rose-400">{t('articles.invalidPosition')}</p>
      )}
      {caption && <figcaption className="text-center text-xs italic text-slate-600 dark:text-slate-300">{caption}</figcaption>}
      <button type="button" onClick={() => showFen(fen)} disabled={!valid} className={actionClass}>
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        {t('articles.showOnBoard')}
      </button>
    </NodeViewWrapper>
  );
};

export const ChessGameView: React.FC<NodeViewProps> = ({ node, editor, deleteNode, selected }) => {
  const { t } = useTranslation();
  const { gameInfo, selectGame } = useArticleBoard();
  const gameKey = node.attrs.gameKey as string;
  const game = gameInfo[gameKey];
  const players = game && (game.white || game.black)
    ? `${game.white ?? t('gameCollection.unknownPlayer')} – ${game.black ?? t('gameCollection.unknownPlayer')}`
    : game?.label ?? t('articles.untitledGame');

  return (
    <NodeViewWrapper className={`${blockClass(selected)} flex flex-wrap items-center gap-3 pr-10`} contentEditable={false} data-chess-game="">
      <RemoveButton editor={editor} deleteNode={deleteNode} />
      <Swords className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {game ? (
          <>
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {players}{game.result ? ` (${game.result})` : ''}
            </p>
            {game.label && (game.white || game.black) && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{game.label}</p>}
          </>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('articles.gameUnavailable')}</p>
        )}
      </div>
      <button type="button" onClick={() => selectGame(gameKey)} disabled={!game} className={actionClass}>
        {t('articles.openGame')}
      </button>
    </NodeViewWrapper>
  );
};

export const MoveRefView: React.FC<NodeViewProps> = ({ node, selected }) => (
  <NodeViewWrapper as="span" contentEditable={false} className={selected ? 'rounded-md ring-2 ring-emerald-500/40' : undefined}>
    <MoveChip gameKey={node.attrs.gameKey as string} ply={Number(node.attrs.ply)} san={(node.attrs.san as string | null) ?? undefined} />
  </NodeViewWrapper>
);

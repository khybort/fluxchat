import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Component overrides — keep the assistant bubble feeling chat-native rather
 * than a long-form blog post. We deliberately downscale prose elements:
 * smaller headings, tighter list spacing, table that respects the bubble
 * width, code blocks with proper monospace + overflow scroll, and external
 * links opened in a new tab.
 */
const components: Components = {
  a: ({ children, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </a>
  ),
  pre: ({ children, ...props }) => (
    <pre
      {...props}
      className="scrollbar-thin overflow-x-auto rounded-md bg-background/60 p-3 text-xs"
    >
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    // Differentiate inline `code` from block ```code```. ReactMarkdown wraps
    // block code in a <pre><code> pair — when the parent is pre, we render
    // bare so the <pre> styling above wins. Inline code gets a chip look.
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[0.85em]" {...props}>
        {children}
      </code>
    );
  },
  table: ({ children, ...props }) => (
    <div className="my-2 overflow-x-auto rounded-md border">
      <table {...props} className="w-full border-collapse text-xs">
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th {...props} className="border-b bg-background/50 px-3 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="border-b px-3 py-1.5 last:border-b-0">
      {children}
    </td>
  ),
  hr: (props) => <hr {...props} className="my-3 border-border/60" />,
};

/**
 * Renders assistant message content as Markdown. GitHub Flavored Markdown
 * via remark-gfm adds tables, strikethrough, task lists, and autolinks.
 *
 * The styling sits on top of `prose prose-sm` from @tailwindcss/typography,
 * with a couple of overrides so headings don't dwarf the surrounding chat
 * UI and code blocks have proper overflow handling.
 */
export const MarkdownContent = ({
  content,
  className,
}: MarkdownContentProps): React.JSX.Element => (
  <div
    className={cn(
      'prose prose-sm dark:prose-invert max-w-none',
      // Tighter spacing — chat bubbles aren't blog posts.
      'prose-p:my-1.5 prose-p:leading-relaxed',
      'prose-headings:mb-2 prose-headings:mt-3 prose-headings:font-semibold prose-headings:text-foreground',
      'prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-h4:text-xs',
      'prose-ul:my-1.5 prose-ul:pl-5 prose-ol:my-1.5 prose-ol:pl-5',
      'prose-li:my-0.5 prose-li:marker:text-muted-foreground',
      'prose-strong:font-semibold prose-strong:text-foreground',
      'prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:pl-3 prose-blockquote:italic',
      // Inherit the bubble's text colour so we contrast against bg-secondary
      // (assistant) rather than fighting prose's hard-coded text-zinc-900.
      'prose-p:text-current prose-li:text-current',
      className,
    )}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  </div>
);

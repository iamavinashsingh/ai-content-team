import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

export default function ArticlePreview({ markdown }) {
  if (!markdown) {
    return (
      <div className="text-white/20 text-sm text-center py-8">
        No article content yet.
      </div>
    );
  }

  return (
    <div className="prose-dark">
      <Markdown rehypePlugins={[rehypeRaw]}>
        {markdown}
      </Markdown>
    </div>
  );
}

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Components } from "react-markdown";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content as a single cohesive block with enhanced formatting
 * 
 * Features:
 * - GitHub Flavored Markdown (tables, strikethrough, task lists, etc.)
 * - Syntax highlighting for code blocks
 * - Proper rendering of links
 * - Preserves whitespace in code blocks
 * - Math equations with KaTeX
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  if (!content) return null;
  
  // Pre-process content to fix common LaTeX issues
  const processedContent = content
    // Fix align environments for KaTeX
    .replace(/\$\$\s*\\begin\{align\}([\s\S]*?)\\end\{align\}\s*\$\$/g, (_, equations) => {
      // Replace & with \\ for KaTeX aligned equations
      const fixedEquations = equations
        .replace(/&=/g, '=')
        .replace(/&/g, '\\\\')
        .replace(/\\\\/g, '\\\\');
      return `$$\\begin{aligned}${fixedEquations}\\end{aligned}$$`;
    })
    // Fix cases environment
    .replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, content) => {
      return `\\begin{cases}${content.replace(/&/g, '\\\\')}\\end{cases}`;
    })
    // Fix matrix environments
    .replace(/\\begin\{pmatrix\}([\s\S]*?)\\end\{pmatrix\}/g, (_, content) => {
      return `\\begin{pmatrix}${content.replace(/&/g, '\\\\')}\\end{pmatrix}`;
    })
    .replace(/\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}/g, (_, content) => {
      return `\\begin{vmatrix}${content.replace(/&/g, '\\\\')}\\end{vmatrix}`;
    });
  
  // Define custom components for markdown rendering
  const components: Components = {
    // Enhanced code block rendering with syntax highlighting
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "text";
      
      return !inline ? (
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          {...props}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      ) : (
        <code className="bg-zinc-800 px-1 py-0.5 rounded text-sm" {...props}>
          {children}
        </code>
      );
    },
    // Make links open in a new tab
    a({ node, children, href, ...props }: any) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline"
          {...props}
        >
          {children}
        </a>
      );
    },
    // Style headings
    h1: ({ children }: any) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-md font-bold mt-2 mb-1">{children}</h3>,
    // Style lists
    ul: ({ children }: any) => <ul className="list-disc pl-6 my-2">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-6 my-2">{children}</ol>,
    // Style blockquotes
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-zinc-600 pl-4 italic my-2">
        {children}
      </blockquote>
    ),
    // Add a custom pre component to handle code blocks in paragraphs
    pre: ({ children }: any) => {
      // This ensures that pre elements (which contain code blocks) 
      // are rendered outside of paragraph tags
      return <div className="my-2">{children}</div>;
    },
    // Override paragraph component to prevent p > pre issues
    p: ({ children, ...props }: any) => {
      // Check if children contains a pre element
      const containsPre = React.Children.toArray(children).some(
        (child) => React.isValidElement(child) && child.type === 'pre'
      );

      // If it contains a pre element, render as a div instead of p
      if (containsPre) {
        return <div {...props}>{children}</div>;
      }

      return <p {...props}>{children}</p>;
    },
  };
  
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { 
            throwOnError: false,
            strict: false,
            output: 'html',
            trust: true,
            macros: {
              // Add any custom macros here if needed
              "\\R": "\\mathbb{R}"
            }
          }]
        ]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
} 
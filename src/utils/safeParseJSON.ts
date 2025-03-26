/**
 * Safely parse a string as JSON and format it
 * Returns the original content if parsing fails or if input is not a string
 */
export function safeParseJSON(content: any): { formattedContent: any } {
  try {
    if (typeof content === 'string' && content.trim() !== '') {
      // Attempt to parse as JSON
      const parsed = JSON.parse(content);
      // If we get here, it's valid JSON
      return { formattedContent: JSON.stringify(parsed, null, 2) };
    }
    return { formattedContent: content };
  } catch (e) {
    // If parsing fails, return the original content
    return { formattedContent: content };
  }
}

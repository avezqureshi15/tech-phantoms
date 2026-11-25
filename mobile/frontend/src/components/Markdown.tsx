import { Linking, Platform, Text, View, type ImageStyle, type TextStyle } from "react-native";
import { Renderer, useMarkdown, type MarkedStyles } from "react-native-marked";
import type { ReactNode } from "react";

import { closeOpenFences, safeUrl } from "@/lib/utsav/markdown";
import { colors, fonts, radius } from "@/lib/theme";

/**
 * Renders what Utsav writes. Differences from the stock renderer, all because the text is untrusted:
 * links open only if they are ordinary web, mail or phone links; images are never fetched (a remote
 * image is a tracking pixel waiting to happen), their description is shown instead; raw HTML is shown
 * as plain text.
 */
class SafeRenderer extends Renderer {
  link(children: string | ReactNode[], href: string, styles?: TextStyle): ReactNode {
    const url = safeUrl(href);
    return (
      <Text
        key={this.getKey()}
        accessibilityRole={url ? "link" : undefined}
        style={styles}
        onPress={url ? () => void Linking.openURL(url).catch(() => undefined) : undefined}
      >
        {children}
      </Text>
    );
  }

  image(_uri: string, alt?: string, _style?: ImageStyle): ReactNode {
    return alt ? this.text(alt) : null;
  }

  linkImage(href: string, _imageUrl: string, alt?: string, style?: ImageStyle): ReactNode {
    return this.link(alt || href, href, style as TextStyle);
  }

  html(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return this.text(text, styles);
  }
}

const renderer = new SafeRenderer();
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

const text: TextStyle = { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.ink };

const markdownStyles: MarkedStyles = {
  text,
  paragraph: { marginBottom: 8 },
  strong: { fontFamily: fonts.bold },
  em: { fontStyle: "italic" },
  strikethrough: { textDecorationLine: "line-through" },
  link: { color: colors.saffronDeep, textDecorationLine: "underline" },
  h1: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, marginTop: 4, marginBottom: 6 },
  h2: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 25, marginTop: 4, marginBottom: 6 },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23, marginTop: 4, marginBottom: 4 },
  h4: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  h5: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  h6: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  li: text,
  list: { marginBottom: 6 },
  codespan: { fontFamily: MONO, fontSize: 14, backgroundColor: colors.sand, color: colors.ink },
  code: { backgroundColor: colors.sand, borderRadius: radius.sm, padding: 12, marginBottom: 8 },
  codeText: { fontFamily: MONO, fontSize: 13, lineHeight: 19, color: colors.ink },
  blockquote: { borderLeftWidth: 3, borderLeftColor: colors.saffron, paddingLeft: 12, marginBottom: 8 },
  hr: { backgroundColor: colors.line, height: 1, marginVertical: 8 },
  table: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, marginBottom: 8 },
  tableRow: { borderBottomWidth: 1, borderBottomColor: colors.line },
  tableCell: { padding: 8 },
};

const theme = {
  colors: {
    background: "transparent",
    code: colors.sand,
    link: colors.saffronDeep,
    text: colors.ink,
    border: colors.line,
  },
};

type Props = {
  children: string;
  /** True while the text is still arriving, so an unfinished code block is tidied for display. */
  streaming?: boolean;
};

export function Markdown({ children, streaming = false }: Props) {
  const elements = useMarkdown(streaming ? closeOpenFences(children) : children, {
    renderer,
    styles: markdownStyles,
    theme,
  });
  return <View>{elements}</View>;
}

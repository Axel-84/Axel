import { useCallback } from 'react';
import { Alert, View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import html from './web-bundle';

// A fixed https address gives the app its own storage, so teams, matches
// and settings are kept between launches (it never loads anything from the web).
const BASE_URL = 'https://volleystats.app/';

const UTI = { 'text/csv': 'public.comma-separated-values-text', 'application/json': 'public.json', 'image/png': 'public.png' };

// Report images arrive as base64 text; turn them back into bytes.
const base64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export default function App() {
  const scheme = useColorScheme();

  // The web app asks to save a file (Export CSV / Back up data) → iPhone share sheet
  const onMessage = useCallback(async event => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg.type !== 'saveFile') return;
    try {
      const file = new File(Paths.cache, msg.filename);
      file.create({ overwrite: true });
      await file.write(msg.base64 ? base64ToBytes(msg.base64) : msg.text);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: msg.mime, UTI: UTI[msg.mime], dialogTitle: msg.filename });
      } else {
        Alert.alert('Saved', msg.filename);
      }
    } catch (e) {
      Alert.alert('Could not share file', String(e?.message || e));
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: scheme === 'dark' ? '#121722' : '#ece4d4' }}>
      <StatusBar style="auto" />
      <WebView
        source={{ html, baseUrl: BASE_URL }}
        originWhitelist={['*']}
        onMessage={onMessage}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        // let the page handle the notch / home bar itself (it uses safe-area insets)
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        // match video and tagging behaviour of a native app
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        // Don't set textInteractionEnabled={false}: on iPhone it also blocks typing in text boxes.
        // The "no text highlighting on long-press" feel is done in www/styles.css instead.
        domStorageEnabled
        javaScriptEnabled
      />
    </View>
  );
}

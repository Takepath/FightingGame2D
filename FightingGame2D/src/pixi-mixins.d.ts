import type { Navigation } from "./engine/navigation/navigation";
import type {
  CreationResizePluginOptions,
  DeepRequired,
} from "./engine/resize/ResizePlugin";

declare global {
  namespace PixiMixins {
    interface Application extends DeepRequired<CreationResizePluginOptions> {
      navigation: Navigation;
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface ApplicationOptions extends CreationResizePluginOptions {}
  }
}

export {};

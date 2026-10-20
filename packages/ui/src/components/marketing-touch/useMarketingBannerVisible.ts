import { useContext, useSyncExternalStore } from "react";
import { isMarketingBannerRenderable } from "@/components/marketing-touch/marketingTouchController.js";
import { MarketingTouchContext } from "@/components/marketing-touch/MarketingTouchProvider.js";

// controller 缺席时用 noop 订阅、快照恒为 false，与 GlobalNoticeSurface 的 null-safe 写法一致。
const subscribeNoop = () => () => {};

/**
 * 仲裁层（SidebarBottomActivity）用它只读订阅左下角营销 banner 是否可见；
 * 判断源仍是 controller.store，本 hook 不持有任何状态。
 *
 * 可见性完全委托给 isMarketingBannerRenderable：UI 已不再实现的动作（如遗留的 plan claim）
 * 在该谓词里即不可渲染，因此这里不会为它们让位，槽位回落到 highspeed 分享卡。
 */
export function useMarketingBannerVisible(): boolean {
  const controller = useContext(MarketingTouchContext);
  return useSyncExternalStore(
    controller ? controller.store.subscribe : subscribeNoop,
    () => (controller ? isMarketingBannerRenderable(controller.store.getState().banner) : false),
    () => false,
  );
}

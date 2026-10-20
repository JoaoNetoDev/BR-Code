import type {
  HighspeedCardSnapshot,
  HighspeedMessageMeta,
  HighspeedPrepareTurnResult,
  ModelSelection,
} from "@zcode/shared";
import type { CommandPayloadMap } from "@zcode/shared/zcode-protocol-v4";

/** 与协议 payload 同源，避免 Renderer 再维护一份执行材料形状。 */
type HighspeedModelExecution = NonNullable<CommandPayloadMap["sendText"]["modelExecution"]>;

export type HighspeedTurnPreparer = (
  taskId: string,
  submissionSelection?: ModelSelection,
) => Promise<HighspeedPrepareTurnResult | null>;

/** 会话投影/草稿里可参与 Highspeed prepare 选择解析的字段（结构兼容 snapshot config）。 */
export interface HighspeedPrepareSelectionSource {
  readonly provider?: string;
  readonly model?: string;
  readonly thought?: string;
  readonly modelSelection?: ModelSelection;
}

/**
 * 解析 Highspeed prepare 的 provider/model/reasoningLevel（spec §3 规则 15）：
 * 与本次提交的 modelSelection 同源——用户刚切换的模型必须在首次发送就驱动 admission，
 * 禁止沿用会话投影里的旧组合抽卡后把提交选择覆盖成卡模型。提交选择缺失时按
 * 会话投影 → 草稿 → 初始草稿逐字段回落；provider 或 model 无法解析时返回 null。
 */
export function resolveHighspeedPrepareSelection(input: {
  submissionSelection?: ModelSelection;
  projectedConfig?: HighspeedPrepareSelectionSource | null;
  draftConfig?: HighspeedPrepareSelectionSource | null;
  initialDraftConfig?: HighspeedPrepareSelectionSource | null;
}): { provider: string; model: string; reasoningLevel?: string } | null {
  const { submissionSelection } = input;
  const fallbacks = [input.projectedConfig, input.draftConfig, input.initialDraftConfig];
  const provider = submissionSelection?.providerId ?? fallbacks.find((c) => c?.provider)?.provider;
  const model = submissionSelection?.modelId ?? fallbacks.find((c) => c?.model)?.model;
  if (!provider || !model) return null;
  const reasoningLevel =
    submissionSelection?.options?.reasoningLevel ??
    fallbacks
      .map((c) => c?.thought || c?.modelSelection?.options?.reasoningLevel)
      .find((value) => !!value);
  return { provider, model, ...(reasoningLevel ? { reasoningLevel } : {}) };
}

export type HighspeedSendContext = {
  override: ReturnType<typeof buildHighspeedRuntimeOverride>;
  acceleratedCard?: HighspeedCardSnapshot;
};

/**
 * Mock 抽中仍保留 accelerated 元数据，但没有 Highspeed 执行材料，
 * 因此只写消息 metadata，让推理继续走当前 session 的普通 provider/model。
 *
 * 加速本轮通过标准 modelSelection + modelExecution{selectionScope:"execution"} 表达：
 * 端点等静态事实来自 Built-in Provider Config，凭据只属于这一次执行、不写 session 常驻选择。
 * 见 docs/highspeed/highspeed-access-mode-migration.md。
 */
export function buildHighspeedRuntimeOverride(
  result: HighspeedPrepareTurnResult | null | undefined,
): {
  highspeedMeta?: HighspeedMessageMeta;
  modelSelection?: ModelSelection;
  modelExecution?: HighspeedModelExecution;
} {
  if (result?.kind !== "accelerated") return {};
  const highspeedMeta: HighspeedMessageMeta = {
    schemaVersion: 1,
    ...result.card,
  };
  if (!result.execution) return { highspeedMeta };
  return {
    highspeedMeta,
    modelSelection: result.execution.modelSelection,
    modelExecution: {
      selectionScope: "execution",
      requestAuth: result.execution.requestAuth,
      selectionFallback: result.execution.selectionFallback,
    },
  };
}

/**
 * 统一发送前的 Highspeed 结果拼装，避免各发送路径分别维护 payload 和 Renderer 统计卡。
 * CLI 仍是最终 admission 权威；这里仅把同一次 prepare 的结果拆成两类既有消费数据。
 */
export async function prepareHighspeedSendContext(
  taskId: string,
  prepareTurn: HighspeedTurnPreparer,
  submissionSelection?: ModelSelection,
): Promise<HighspeedSendContext> {
  const result = await prepareTurn(taskId, submissionSelection);
  return {
    override: buildHighspeedRuntimeOverride(result),
    ...(result?.kind === "accelerated" ? { acceleratedCard: result.card } : {}),
  };
}

/** 发送等待预算：抽卡最多等这么久就放行普通发送（spec §1、§3）。 */
export const HIGHSPEED_SEND_WAIT_BUDGET_MS = 1000;

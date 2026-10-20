import {
  BIGMODEL_PROVIDER_ID,
  buildBigModelApiUrl,
  buildBigModelCodingPlanPersonalManageUrl,
  BUILTIN_MODEL_PROVIDER_IDS,
  createUuid,
  type OAuthProviderId,
  ZCODE_ENV,
  ZAI_PROVIDER_ID,
  type BuiltinModelProviderId,
  type UsageQuotaLimit,
  type UsageEntitlementSubscriptionDetail,
  type UsageEntitlementSnapshot,
} from "@zcode/shared";
import type { ProviderSettingsFormProvider } from "@/lib/providerSettingsFormTypes.js";
import { getProviderFormLabel } from "@/lib/providerSettingsFormTypes.js";

export function generateId(): string {
  return createUuid();
}

export const PRESET_SUBSCRIPTION_TIMEOUT_MS = 2 * 60 * 1000;
export const BIGMODEL_REGISTRATION_URL = buildBigModelApiUrl({ ZCODE_ENV }, "/login");
export const BIGMODEL_CODING_PLAN_PERSONAL_MANAGE_URL = buildBigModelCodingPlanPersonalManageUrl({
  ZCODE_ENV,
});

export interface PresetProviderSpec {
  id: BuiltinModelProviderId;
  displayName: string;
  oauthProviderId?: OAuthProviderId;
  /**
   * RF-08：按 API key 接入的预设可以声明注册地址。
   * 声明后才在鉴权报「账号未注册」时展示通用注册提示，不对品牌做特判。
   */
  registrationUrl?: string;
}

export const PRESET_PROVIDER_SPECS: PresetProviderSpec[] = [
  {
    id: BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
    displayName: "Z.ai",
    oauthProviderId: ZAI_PROVIDER_ID,
  },
  {
    id: BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan,
    displayName: "BigModel",
    oauthProviderId: BIGMODEL_PROVIDER_ID,
    registrationUrl: BIGMODEL_REGISTRATION_URL,
  },
];

export const PRESET_PROVIDER_SPEC_BY_ID = new Map<BuiltinModelProviderId, PresetProviderSpec>(
  PRESET_PROVIDER_SPECS.map((item) => [item.id, item]),
);

export type CodingPlanProviderId =
  | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan
  | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan
  | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan
  | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan
  | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan
  | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan;

export type CodingPlanStatus =
  | "disconnected"
  | "checking"
  | "notPurchased"
  | "purchased"
  | "unavailable"
  | "unsupported";

export type TeamPlanAvailabilityReason = "not-allocated" | "expired" | "credential-unavailable";

interface CodingPlanProviderSpec {
  id: CodingPlanProviderId;
  oauthProviderId: OAuthProviderId;
  label: string;
  providerName: string;
  purchaseUrl?: string;
  /** RF-08：可选注册地址，仅用于通用注册提示。 */
  registrationUrl?: string;
}

export const CODING_PLAN_PROVIDER_SPECS: CodingPlanProviderSpec[] = [
  {
    id: BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
    oauthProviderId: ZAI_PROVIDER_ID,
    label: "Z.ai - Coding Plan",
    providerName: "Z.ai",
    purchaseUrl: "https://z.ai/manage-apikey/subscription",
  },
  {
    id: BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
    oauthProviderId: ZAI_PROVIDER_ID,
    label: "Z.ai - Coding Plan",
    providerName: "Z.ai",
    purchaseUrl: "https://z.ai/manage-apikey/subscription",
  },
  {
    id: BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
    oauthProviderId: BIGMODEL_PROVIDER_ID,
    label: "BigModel - Coding Plan",
    providerName: "BigModel",
    purchaseUrl: BIGMODEL_CODING_PLAN_PERSONAL_MANAGE_URL,
    registrationUrl: BIGMODEL_REGISTRATION_URL,
  },
  {
    id: BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan,
    oauthProviderId: BIGMODEL_PROVIDER_ID,
    label: "BigModel- Coding Plan",
    providerName: "BigModel",
    purchaseUrl: BIGMODEL_CODING_PLAN_PERSONAL_MANAGE_URL,
    registrationUrl: BIGMODEL_REGISTRATION_URL,
  },
];

/** RF-08：读取预设声明的注册地址；未声明返回 undefined，设置页不显示注册提示。 */
export function resolveProviderRegistrationUrl(
  presetId: BuiltinModelProviderId,
): string | undefined {
  return (
    PRESET_PROVIDER_SPEC_BY_ID.get(presetId)?.registrationUrl ??
    CODING_PLAN_PROVIDER_SPECS.find((spec) => spec.id === presetId)?.registrationUrl
  );
}

export interface CodingPlanEntitlementState {
  snapshot: UsageEntitlementSnapshot | null;
  loading: boolean;
  error: string | null;
}

export function resolveModelProviderDisplayName(
  provider: Pick<ProviderSettingsFormProvider, "providerId" | "config">,
): string {
  if (
    provider.providerId === BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan ||
    provider.providerId === BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan
  ) {
    return "Z.ai - Coding Plan";
  }

  if (provider.providerId === BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan) {
    return "Start Plan";
  }

  if (provider.providerId === BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan) {
    return "Start Plan";
  }

  return getProviderFormLabel(provider);
}

export type ModelProviderNavItem =
  | {
      key: string;
      type: "preset";
      /** 品牌入口图标独立于其历史 Start 导航身份。 */
      logo?: ProviderSettingsFormProvider["config"]["logo"];
      /** 账号组圆点只展示当前具体连接的公共执行结果。 */
      statusProvider?: ProviderSettingsFormProvider | null;
      presetId: BuiltinModelProviderId;
      label: string;
      provider: ProviderSettingsFormProvider | null;
      displayName: string;
      statusActive: boolean;
    }
  | {
      key: string;
      type: "codingPlan";
      presetId: CodingPlanProviderId;
      oauthProviderId: OAuthProviderId;
      label: string;
      providerName: string;
      provider: ProviderSettingsFormProvider | null;
      /** Account Overlay 是否已启用该 Provider。 */
      accountEntitled?: boolean;
      status: CodingPlanStatus;
      planLevel?: string | null;
      currentProductId?: string | null;
      subscriptionBillingCycle?: string | null;
      subscriptionRenewTime?: string | null;
      subscriptionExpireTime?: string | null;
      subscriptionDetails?: UsageEntitlementSubscriptionDetail[];
      quotaLimits?: UsageQuotaLimit[];
      /** 官方 Server MCP 额度（服务端下发的总额度）。不在 quota.limits[] 里，单独透传给额度卡片。 */
      mcpQuotaLimit?: UsageQuotaLimit | null;
      purchaseUrl?: string;
      /** 权益查询明确要求重新登录；文案不参与操作分支判定。 */
      accountLoginRequired?: boolean;
      statusLabelId?: string;
      statusMessage?: string | null;
      inactivePlanTitle?: string | null;
      statusActive: boolean;
    }
  | {
      key: string;
      type: "teamPlan";
      presetId: CodingPlanProviderId;
      oauthProviderId: OAuthProviderId;
      label: string;
      providerName: string;
      teamPlanName: string;
      organizationId?: string | null;
      projectId?: string | null;
      provider: ProviderSettingsFormProvider | null;
      /** Account Overlay 是否已启用该 Provider。 */
      accountEntitled?: boolean;
      status: CodingPlanStatus;
      planLevel?: string | null;
      currentProductId?: string | null;
      subscriptionBillingCycle?: string | null;
      subscriptionRenewTime?: string | null;
      subscriptionExpireTime?: string | null;
      subscriptionDetails?: UsageEntitlementSubscriptionDetail[];
      quotaLimits?: UsageQuotaLimit[];
      /** 官方 Server MCP 额度（服务端下发的总额度）。不在 quota.limits[] 里，单独透传给额度卡片。 */
      mcpQuotaLimit?: UsageQuotaLimit | null;
      purchaseUrl?: string;
      statusLabelId?: string;
      statusMessage?: string | null;
      /** Team 状态的业务原因。交互不得再从 i18n 文案反推。 */
      availabilityReason?: TeamPlanAvailabilityReason;
      inactivePlanTitle?: string | null;
      statusActive: boolean;
    }
  | {
      key: string;
      type: "codingPlanLoading";
      label: string;
      providerName: string;
      oauthProviderId?: OAuthProviderId;
    }
  | {
      key: string;
      type: "custom";
      label: string;
      provider: ProviderSettingsFormProvider;
      statusActive: boolean;
    };

export type ModelProviderNavGroupId = "preset" | "custom";

export interface ModelProviderNavGroup {
  id: ModelProviderNavGroupId;
  title: string;
  items: ModelProviderNavItem[];
}

/** RF-05：设置页已无 OAuth 登录动作；该类型只描述凭据恢复选项，保留给后续 Host 刷新契约。 */
export type CodingPlanLoginOptions = {
  forceOAuth?: boolean;
};

// 修复原因：Start Plan 是免费入口，套餐列表必须读取对应付费 Coding Plan 的商品源，
// 否则会把免费 SKU 当成可购买套餐重复展示。原先随原生购买卡下线后迁移到预设常量文件。
export function resolveCodingPlanUpgradeProductsProviderId(
  providerId: CodingPlanProviderId,
): CodingPlanProviderId {
  if (providerId === BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan) {
    return BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan;
  }

  return providerId === BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan
    ? BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan
    : providerId;
}

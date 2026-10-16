import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronsUpDown,
  FolderCog,
  FolderOpen,
  Layers,
  Plus,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AppId } from "@/lib/api/types";
import { useInstalledSkills } from "@/hooks/useSkills";
import {
  useApplyProfileMutation,
  useApplyProfileSkillsMutation,
  useClearProfileMutation,
  useCreateProfileMutation,
  useProfilesQuery,
} from "@/lib/query/profiles";
import { ProfileManageDialog } from "./ProfileManageDialog";
import { APP_PROFILE_SCOPE, hasScopeSnapshot } from "./scope";
import type {
  CurrentProfileIds,
  Profile,
  ProfileScope,
} from "@/lib/api/profiles";

const CURRENT_ID_KEY: Record<ProfileScope, keyof CurrentProfileIds> = {
  claude: "claude",
  "claude-desktop": "claudeDesktop",
  codex: "codex",
};

interface ProfileSwitcherProps {
  activeApp: AppId;
  /** Skills 页「技能组合」：只应用项目里的 Skill 启用状态，当前项按启用集合匹配 */
  skillsOnly?: boolean;
}

/**
 * 项目 Profile 切换器（header 左侧入口）
 *
 * 项目列表全应用共享（用户拥有的项目就那几个），但切换按分组进行：
 * Claude 组（Claude Code 的供应商/MCP/Skills/记忆文件 + Claude Desktop
 * 的供应商）与 Codex 组各自指向自己的当前项目、只应用组内快照。
 * 与右侧 AppSwitcher（仅切换查看的应用）语义不同。
 */
export function ProfileSwitcher({
  activeApp,
  skillsOnly = false,
}: ProfileSwitcherProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const { data } = useProfilesQuery();
  const applyMutation = useApplyProfileMutation();
  const applySkillsMutation = useApplyProfileSkillsMutation();
  const { data: installedSkills } = useInstalledSkills();
  const clearMutation = useClearProfileMutation();
  const createMutation = useCreateProfileMutation();

  // Profile 仅作用于受支持的应用——在其他应用的标签页展示会误导用户
  // 以为当前应用也被切换了，因此只在有所属分组的应用页面渲染
  const scope = APP_PROFILE_SCOPE[activeApp];
  if (!scope) {
    return null;
  }

  const profiles = data?.profiles ?? [];
  // 技能组合不改当前项目标记，当前项 = 记录的 Skill 集合与现在启用的一致的那个
  const installedIds = new Set((installedSkills ?? []).map((s) => s.id));
  const enabledIds = new Set(
    (installedSkills ?? []).filter((s) => s.apps[scope]).map((s) => s.id),
  );
  const comboSkillIds = (profile: Profile) =>
    profile.payload.skills[scope]?.filter((id) => installedIds.has(id));
  const matchesEnabledSkills = (profile: Profile) => {
    const ids = comboSkillIds(profile);
    return (
      !!ids &&
      ids.length === enabledIds.size &&
      ids.every((id) => enabledIds.has(id))
    );
  };

  const currentId = skillsOnly
    ? (profiles.find(matchesEnabledSkills)?.id ?? null)
    : (data?.currentIds?.[CURRENT_ID_KEY[scope]] ?? null);
  const currentProfile = profiles.find((p) => p.id === currentId);
  const createLabel = skillsOnly
    ? t("skills.combo.create")
    : t("profiles.createFromCurrent");
  const noneLabel = skillsOnly ? t("skills.combo.none") : t("profiles.none");
  const tooltip = skillsOnly
    ? t("skills.combo.tooltip")
    : t(`profiles.switcherTooltip.${scope}`);

  const handleApply = (profile: Profile) => {
    setOpen(false);
    if (profile.id === currentId) return;
    if (skillsOnly) {
      applySkillsMutation.mutate({ id: profile.id, scope, name: profile.name });
    } else {
      applyMutation.mutate({ id: profile.id, scope });
    }
  };

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setNewName("");
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate({ name, scope }, { onSuccess: closeCreateDialog });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={t(
              skillsOnly
                ? "skills.combo.ariaLabel"
                : "profiles.switcherAriaLabel",
              { name: currentProfile?.name ?? noneLabel },
            )}
            title={tooltip}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
              "hover:bg-black/5 dark:hover:bg-white/5",
              currentProfile ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {skillsOnly ? (
              <Layers className="h-4 w-4 shrink-0 opacity-70" />
            ) : (
              <FolderOpen className="h-4 w-4 shrink-0 opacity-70" />
            )}
            <span className="max-w-[9rem] truncate">
              {currentProfile?.name ?? noneLabel}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          aria-label={tooltip}
          className="z-[100] w-64 p-0"
        >
          <Command
            label={t(
              skillsOnly ? "skills.combo.search" : "profiles.searchPlaceholder",
            )}
          >
            <CommandInput
              placeholder={t(
                skillsOnly
                  ? "skills.combo.search"
                  : "profiles.searchPlaceholder",
              )}
            />
            <CommandList>
              <CommandEmpty>
                {t(skillsOnly ? "skills.combo.empty" : "profiles.empty")}
              </CommandEmpty>
              {profiles.length > 0 && (
                <CommandGroup>
                  {profiles.map((profile) => (
                    <CommandItem
                      key={profile.id}
                      value={profile.id}
                      keywords={[profile.name]}
                      onSelect={() => handleApply(profile)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          currentId === profile.id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      <span className="truncate">{profile.name}</span>
                      {skillsOnly ? (
                        <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
                          {comboSkillIds(profile)
                            ? t("skills.combo.count", {
                                count: comboSkillIds(profile)!.length,
                              })
                            : t("skills.combo.notCaptured")}
                        </span>
                      ) : (
                        !hasScopeSnapshot(profile, scope) && (
                          <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
                            {t("profiles.noSnapshotForScope")}
                          </span>
                        )
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <div className="mx-1 my-1 h-px bg-border" />
              <CommandGroup>
                <CommandItem
                  value="__create__"
                  keywords={[createLabel]}
                  onSelect={() => {
                    setOpen(false);
                    setIsCreateOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4 shrink-0" />
                  {createLabel}
                </CommandItem>
                {currentId && !skillsOnly && (
                  <CommandItem
                    value="__clear__"
                    keywords={[t("profiles.none")]}
                    onSelect={() => {
                      setOpen(false);
                      clearMutation.mutate(scope);
                    }}
                  >
                    <X className="mr-2 h-4 w-4 shrink-0" />
                    {t("profiles.none")}
                  </CommandItem>
                )}
                {profiles.length > 0 && (
                  <CommandItem
                    value="__manage__"
                    keywords={[t("profiles.manage")]}
                    onSelect={() => {
                      setOpen(false);
                      setIsManageOpen(true);
                    }}
                  >
                    <FolderCog className="mr-2 h-4 w-4 shrink-0" />
                    {t("profiles.manage")}
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog();
        }}
      >
        <DialogContent className="max-w-sm" zIndex="alert">
          <DialogHeader className="space-y-3 border-b-0 bg-transparent pb-0">
            <DialogTitle>{createLabel}</DialogTitle>
            <DialogDescription>
              {skillsOnly
                ? t("skills.combo.createDescription")
                : t(`profiles.createDescription.${scope}`)}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pt-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("profiles.namePlaceholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>
          <DialogFooter className="flex gap-2 border-t-0 bg-transparent pt-2 sm:justify-end">
            <Button variant="outline" onClick={closeCreateDialog}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || createMutation.isPending}
            >
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProfileManageDialog
        isOpen={isManageOpen}
        onClose={() => setIsManageOpen(false)}
      />
    </>
  );
}

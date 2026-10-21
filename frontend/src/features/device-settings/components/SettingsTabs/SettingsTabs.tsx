import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { SettingsSectionDefinition, SettingsSectionId } from '../../model/types';
export interface SettingsTabsProps {
  sections: readonly SettingsSectionDefinition[];
  activeId: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}
export function SettingsTabs({ sections, activeId, onSelect }: SettingsTabsProps) {
  const tabs = useRef(new Map<SettingsSectionId, HTMLButtonElement>());
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number | undefined;
    if (event.key === 'ArrowRight') target = (index + 1) % sections.length;
    if (event.key === 'ArrowLeft') target = (index - 1 + sections.length) % sections.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = sections.length - 1;
    const section = target === undefined ? undefined : sections[target];
    if (section) {
      event.preventDefault();
      onSelect(section.id);
      tabs.current.get(section.id)?.focus();
    }
  }
  return (
    <div className="settings-tabs" role="tablist" aria-label="Nhóm cấu hình thiết bị">
      {sections.map((section, index) => (
        <button
          key={section.id}
          ref={(node) => {
            if (node) tabs.current.set(section.id, node);
            else tabs.current.delete(section.id);
          }}
          id={`settings-tab-${section.id}`}
          role="tab"
          aria-selected={section.id === activeId}
          aria-controls={`settings-panel-${section.id}`}
          tabIndex={section.id === activeId ? 0 : -1}
          className="settings-tab"
          onClick={() => onSelect(section.id)}
          onKeyDown={(event) => navigate(event, index)}
        >
          {section.title}
        </button>
      ))}
    </div>
  );
}

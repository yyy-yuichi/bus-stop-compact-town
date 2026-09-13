import { createContext, useContext } from 'react';
export type BasemapMode = 'soft' | 'standard';
export const BasemapPreferences = createContext<{ mode: BasemapMode; onMode: (mode: BasemapMode) => void; fallback: boolean }>({mode:'soft',onMode:()=>{},fallback:false});
export default function BasemapSettings() {
  const {mode,onMode,fallback} = useContext(BasemapPreferences);
  return <section className="basemap-settings"><h3>地図の見た目</h3><div role="group" aria-label="背景地図">
    <button aria-pressed={mode === 'soft'} onClick={()=>onMode('soft')}><span className="basemap-swatch soft-swatch" aria-hidden="true"/>案内図</button>
    <button aria-pressed={mode === 'standard'} onClick={()=>onMode('standard')}><span className="basemap-swatch standard-swatch" aria-hidden="true"/>標準<span className="helper-text">軽い表示</span></button>
  </div>{fallback && <p className="helper-text" role="status">現在は標準地図で表示しています。「案内図」を押すと再試行します。</p>}</section>;
}

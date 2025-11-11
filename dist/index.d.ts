import { Context, Schema } from 'koishi';
export declare const name = "bf6-stats";
export interface Config {
    defaultPlatform: 'pc' | 'ps' | 'xbox';
    language: string;
    accentColor: string;
    cardWidth: number;
    cardHeight: number;
    primaryMetricColumns: number;
    secondaryMetricColumns: number;
    topWeaponsCount: number;
    enableCache: boolean;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;

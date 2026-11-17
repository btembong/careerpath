import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'fs';
import { open, type CityResponse, type Reader } from 'maxmind';

export interface Place { city: string | null; country: string | null; countryCode: string | null }

const DEFAULT_DB = '/srv/careerpath-data/geo/dbip-city-lite.mmdb';
const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i;

/**
 * City and country for an IP address, from the free DB-IP database kept on our own server (IP data by DB-IP,
 * CC BY 4.0, refreshed monthly by /root/update-geoip.sh). No address is sent anywhere. Without the file it
 * answers nothing, so places are simply left out.
 */
@Injectable()
export class GeoService implements OnModuleInit {
  private readonly logger = new Logger(GeoService.name);
  private reader: Reader<CityResponse> | null = null;
  private cache = new Map<string, Place | null>();

  async onModuleInit() {
    const path = process.env.GEOIP_DB || DEFAULT_DB;
    if (!existsSync(path)) { this.logger.warn(`No location database at ${path}: places are left out`); return; }
    try { this.reader = await open<CityResponse>(path); this.logger.log(`Location database loaded (${path})`); }
    catch (err: any) { this.logger.warn(`Location database not readable: ${err?.message}`); }
  }

  place(ip: string | null | undefined): Place | null {
    if (!ip || !this.reader) return null;
    const addr = ip.replace(/^::ffff:/, '');
    if (PRIVATE.test(addr)) return null;
    if (this.cache.has(addr)) return this.cache.get(addr)!;
    let out: Place | null = null;
    try {
      const r = this.reader.get(addr);
      if (r?.country) out = { city: r.city?.names?.en ?? null, country: r.country.names?.en ?? null, countryCode: r.country.iso_code ?? null };
    } catch { /* not an address */ }
    if (this.cache.size > 20_000) this.cache.clear();
    this.cache.set(addr, out);
    return out;
  }
}

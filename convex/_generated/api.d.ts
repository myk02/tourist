/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bookings from "../bookings.js";
import type * as listings from "../listings.js";
import type * as moments from "../moments.js";
import type * as positions from "../positions.js";
import type * as scraper_constants from "../scraper/constants.js";
import type * as scraper_firecrawl from "../scraper/firecrawl.js";
import type * as scraper_index from "../scraper/index.js";
import type * as scraper_legacy from "../scraper/legacy.js";
import type * as scraper_taxis from "../scraper/taxis.js";
import type * as scraper_verticalConfig from "../scraper/verticalConfig.js";
import type * as scraper_wikipedia from "../scraper/wikipedia.js";
import type * as trips from "../trips.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bookings: typeof bookings;
  listings: typeof listings;
  moments: typeof moments;
  positions: typeof positions;
  "scraper/constants": typeof scraper_constants;
  "scraper/firecrawl": typeof scraper_firecrawl;
  "scraper/index": typeof scraper_index;
  "scraper/legacy": typeof scraper_legacy;
  "scraper/taxis": typeof scraper_taxis;
  "scraper/verticalConfig": typeof scraper_verticalConfig;
  "scraper/wikipedia": typeof scraper_wikipedia;
  trips: typeof trips;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

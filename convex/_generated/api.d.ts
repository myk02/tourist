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
import type * as http from "../http.js";
import type * as listings from "../listings.js";
import type * as moments from "../moments.js";
import type * as payments from "../payments.js";
import type * as payments_helpers from "../payments_helpers.js";
import type * as positions from "../positions.js";
import type * as reminders from "../reminders.js";
import type * as saved from "../saved.js";
import type * as scraper_constants from "../scraper/constants.js";
import type * as scraper_firecrawl from "../scraper/firecrawl.js";
import type * as scraper_http_scraper from "../scraper/http_scraper.js";
import type * as scraper_index from "../scraper/index.js";
import type * as scraper_taxis from "../scraper/taxis.js";
import type * as scraper_verticalConfig from "../scraper/verticalConfig.js";
import type * as scraper_wikipedia from "../scraper/wikipedia.js";
import type * as subscription_helpers from "../subscription_helpers.js";
import type * as subscriptions from "../subscriptions.js";
import type * as trips from "../trips.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bookings: typeof bookings;
  http: typeof http;
  listings: typeof listings;
  moments: typeof moments;
  payments: typeof payments;
  payments_helpers: typeof payments_helpers;
  positions: typeof positions;
  reminders: typeof reminders;
  saved: typeof saved;
  "scraper/constants": typeof scraper_constants;
  "scraper/firecrawl": typeof scraper_firecrawl;
  "scraper/http_scraper": typeof scraper_http_scraper;
  "scraper/index": typeof scraper_index;
  "scraper/taxis": typeof scraper_taxis;
  "scraper/verticalConfig": typeof scraper_verticalConfig;
  "scraper/wikipedia": typeof scraper_wikipedia;
  subscription_helpers: typeof subscription_helpers;
  subscriptions: typeof subscriptions;
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

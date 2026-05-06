import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  screenCompound,
  screenCompounds,
  screenBBB,
  screenCYP450Panel,
  parseMeasuredDataCsv,
} from "./screening";
import {
  saveScreeningSession,
  getScreeningHistory,
  getSessionResults,
} from "./db";
import type { CompoundProperties, ScreeningResult } from "../shared/types";

/** Zod schema for compound data sent from frontend (fetched via PubChem in browser) */
const compoundDataSchema = z.object({
  name: z.string(),
  cid: z.number().nullable(),
  smiles: z.string().nullable(),
  mw: z.number().nullable(),
  logP: z.number().nullable(),
  tpsa: z.number().nullable(),
  hbd: z.number().nullable(),
  hba: z.number().nullable(),
  status: z.enum([
    "success",
    "not_found",
    "name_unresolved",
    "not_single_compound",
    "error",
  ]),
  errorMessage: z.string().optional(),
});

export const appRouter = router({
  literature: router({
    rxnormProducts: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(200),
          limit: z.number().min(1).max(50).optional(),
        })
      )
      .query(async ({ input }) => {
        const { fetchRxNormDrugProducts } = await import("./_core/rxnorm");
        const products = await fetchRxNormDrugProducts({
          name: input.name,
          max: input.limit ?? 20,
        });
        return {
          name: input.name,
          products,
          rxnavSearchUrl: `https://mor.nlm.nih.gov/RxNav/search?searchBy=STRING&searchTerm=${encodeURIComponent(input.name)}`,
        };
      }),

    clinicalTrials: publicProcedure
      .input(
        z.object({
          term: z.string().min(1).max(200),
          limit: z.number().min(1).max(20).optional(),
        })
      )
      .query(async ({ input }) => {
        const { fetchClinicalTrials } = await import("./_core/clinicaltrials");
        const trials = await fetchClinicalTrials({
          term: input.term,
          max: input.limit ?? 10,
        });
        return {
          term: input.term,
          trials,
          ctgovSearchUrl: `https://clinicaltrials.gov/search?query=${encodeURIComponent(input.term)}`,
        };
      }),

    pubchem3dSdf: publicProcedure
      .input(z.object({ cid: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { fetchPubChem3dSdfByCid } = await import("./_core/pubchem3d");
        const sdf = await fetchPubChem3dSdfByCid(input.cid);
        return {
          cid: input.cid,
          sdf,
          pubchem3dUrl:
            `https://pubchem.ncbi.nlm.nih.gov/compound/${input.cid}#section=3D-Conformer` as const,
        };
      }),
    pubchemDescription: publicProcedure
      .input(
        z.object({
          cid: z.number().int().positive(),
          name: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        const { fetchPubChemDescriptionByCid } = await import(
          "./_core/pubchemView"
        );
        const desc = await fetchPubChemDescriptionByCid(input.cid);
        return {
          cid: input.cid,
          name: input.name ?? null,
          description: desc,
          pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${input.cid}`,
        };
      }),

    pubmedRecent: publicProcedure
      .input(
        z.object({
          term: z.string().min(1).max(200),
          years: z.number().min(1).max(10).optional(),
          limit: z.number().min(1).max(50).optional(),
        })
      )
      .query(async ({ input }) => {
        const { fetchPubMedRecentArticles } = await import("./_core/pubmed");
        const articles = await fetchPubMedRecentArticles({
          term: input.term,
          years: input.years ?? 5,
          retmax: input.limit ?? 20,
        });

        const q = new URLSearchParams({ term: input.term }).toString();
        return {
          term: input.term,
          years: input.years ?? 5,
          pubmedSearchUrl: `https://pubmed.ncbi.nlm.nih.gov/?${q}`,
          articles,
        };
      }),
  }),
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  screening: router({
    /** Screen a single compound by name (server-side PubChem fetch - fallback) */
    single: publicProcedure
      .input(z.object({ name: z.string().min(1).max(200) }))
      .mutation(async ({ input }) => {
        return screenCompound(input.name);
      }),

    /** Screen multiple compounds by name (server-side PubChem fetch - fallback) */
    batch: publicProcedure
      .input(
        z.object({
          names: z.array(z.string().min(1).max(200)).min(1).max(100),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const results = await screenCompounds(input.names);
        const userId = ctx.user?.id ?? null;
        saveScreeningSession(userId, results).catch(err =>
          console.error("[Screening] Failed to save session:", err)
        );
        return results;
      }),

    /**
     * Screen compounds with pre-fetched data from frontend.
     * The frontend fetches PubChem data directly (CORS-enabled),
     * then sends the data here for BBB + CYP450 screening calculations.
     */
    screenWithData: publicProcedure
      .input(
        z.object({
          compounds: z.array(compoundDataSchema).min(1).max(100),
          measuredDataCsv: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const measuredRecords = input.measuredDataCsv
          ? parseMeasuredDataCsv(input.measuredDataCsv)
          : [];

        const results: ScreeningResult[] = input.compounds.map(compoundData => {
          const compound: CompoundProperties = {
            name: compoundData.name,
            cid: compoundData.cid,
            smiles: compoundData.smiles,
            mw: compoundData.mw,
            logP: compoundData.logP,
            tpsa: compoundData.tpsa,
            hbd: compoundData.hbd,
            hba: compoundData.hba,
            status: compoundData.status,
            errorMessage: compoundData.errorMessage,
          };
          const bbb = screenBBB(compound);
          const cyp450 = screenCYP450Panel(compound, measuredRecords);
          return { compound, bbb, cyp2e1: cyp450.cyp2e1, cyp450 };
        });

        const userId = ctx.user?.id ?? null;
        saveScreeningSession(userId, results).catch(err =>
          console.error("[Screening] Failed to save session:", err)
        );

        return results;
      }),

    /** Get screening history */
    history: publicProcedure
      .input(
        z.object({ limit: z.number().min(1).max(50).optional() }).optional()
      )
      .query(async ({ ctx, input }) => {
        return getScreeningHistory(ctx.user?.id ?? null, input?.limit ?? 20);
      }),

    /** Get results for a specific session */
    sessionResults: publicProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ input }) => {
        return getSessionResults(input.sessionId);
      }),
  }),
});

export type AppRouter = typeof appRouter;

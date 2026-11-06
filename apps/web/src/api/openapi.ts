import {
  ApiError,
  ApiListParams,
  EventListParams,
  MetaDto,
  OpportunityDto,
  OrganizationDto,
  OrganizationListParams,
  OrganizationOpportunitiesParams,
} from "@devspot/schema";
import { z } from "zod";
import { createDocument, type ZodOpenApiResponsesObject } from "zod-openapi";

// Named components, so the document reads as the DTOs in docs/06 §2.
const Opportunity = OpportunityDto.meta({ id: "Opportunity" });
const Organization = OrganizationDto.meta({ id: "Organization" });
const ErrorBody = ApiError.meta({ id: "Error" });
const Meta = MetaDto.meta({ id: "Meta" });
const page = <T extends z.ZodType>(item: T, id: string) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() }).meta({ id });
const OpportunityPage = page(Opportunity, "OpportunityPage");
const OrganizationPage = page(Organization, "OrganizationPage");

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { "application/json": { schema } },
});
const errors = {
  "400": json(ErrorBody, "A query parameter is not valid"),
  "429": json(ErrorBody, "Rate limited: 60 requests a minute per IP"),
  "500": json(ErrorBody, "Internal error"),
} satisfies ZodOpenApiResponsesObject;
const notFound = { "404": json(ErrorBody, "Not found, or not published") };
const slug = z.object({ slug: z.string() });

/** OpenAPI 3.1 for `/api/v1`, from the same Zod schemas the handlers use (docs/06 §4). */
export function openapiDocument() {
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "devspot API",
      version: "1",
      description:
        "Read-only opportunities for early-career tech people in Nigeria. Only published and closed opportunities exist here. Requirements are verbatim from the organisation; nothing in this API says who is eligible.",
      license: { name: "Apache-2.0", identifier: "Apache-2.0" },
    },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/opportunities": {
        get: {
          summary: "List opportunities",
          requestParams: { query: ApiListParams },
          responses: { "200": json(OpportunityPage, "A page of opportunities"), ...errors },
        },
      },
      "/opportunities/{slug}": {
        get: {
          summary: "One opportunity",
          requestParams: { path: slug },
          responses: { "200": json(Opportunity, "The opportunity"), ...notFound, ...errors },
        },
      },
      "/events": {
        get: {
          summary: "Upcoming events, by start",
          requestParams: { query: EventListParams },
          responses: { "200": json(OpportunityPage, "A page of events"), ...errors },
        },
      },
      "/organizations": {
        get: {
          summary: "List organizations",
          requestParams: { query: OrganizationListParams },
          responses: { "200": json(OrganizationPage, "A page of organizations"), ...errors },
        },
      },
      "/organizations/{slug}": {
        get: {
          summary: "One organization, with its sources' health",
          requestParams: { path: slug },
          responses: { "200": json(Organization, "The organization"), ...notFound, ...errors },
        },
      },
      "/organizations/{slug}/opportunities": {
        get: {
          summary: "An organization's opportunities",
          requestParams: { path: slug, query: OrganizationOpportunitiesParams },
          responses: {
            "200": json(OpportunityPage, "A page of opportunities"),
            ...notFound,
            ...errors,
          },
        },
      },
      "/meta": {
        get: {
          summary: "Counts, the last engine run, and the controlled vocabularies",
          responses: { "200": json(Meta, "Metadata"), ...errors },
        },
      },
    },
  });
}

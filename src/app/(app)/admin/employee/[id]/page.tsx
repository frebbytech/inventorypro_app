import ViewEmployee from "@/components/admin/employees/ViewEmployee";
import { SearchParams } from "nuqs/server";

type PageProps = {
  params: Promise<{ id?: string }>;
  searchParams: Promise<SearchParams>;
};

export default async function Page({ params, searchParams }: PageProps) {
  // 1. Await both promises in parallel
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  return <ViewEmployee params={resolvedParams} />;
}

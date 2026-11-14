import SalesDetailsPage from "@/components/summary/SalesDetailsPage";
type Props = {
  params: Promise<{
    id: string;
  }>;
};

// export const dynamic = "force-dynamic";

export default async function Page({ params }: Props) {
  const { id } = await params;


  return <SalesDetailsPage salesId={id} />;
}

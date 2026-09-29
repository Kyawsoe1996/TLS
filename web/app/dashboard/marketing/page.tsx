import { AiGenerator } from "@/components/ai-generator";
import { getShop } from "@/lib/shop";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const shop = await getShop();

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">AI Marketing</h1>
        <p className="text-white/60">
          Generate social posts, captions, and campaign ideas in one click.
        </p>
      </header>

      <AiGenerator
        kind="marketing"
        buttonLabel="Generate content"
        staticFields={{ shopName: shop.name }}
        fields={[
          { name: "occasion", label: "Occasion / season", placeholder: "e.g. Eid sale" },
          {
            name: "tone",
            label: "Tone",
            type: "select",
            options: ["festive", "warm", "professional", "playful", "luxury"],
          },
          { name: "service", label: "Featured service", placeholder: "e.g. bespoke suits" },
        ]}
      />
    </div>
  );
}

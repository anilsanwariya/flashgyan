import { supabase } from "@/integrations/supabase/client";

export async function parsePdfForSaathi(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    // Call our secure Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('parse-pdf', {
      body: formData,
    });

    if (error) throw new Error(error.message);
    if (!data.markdown) throw new Error("No markdown returned from parser");

    return data.markdown;

  } catch (error) {
    console.error("Error parsing PDF for SAATHI:", error);
    throw new Error("Could not parse the PDF. Please try a different file.");
  }
}
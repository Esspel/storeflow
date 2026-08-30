-- Fix permissions for apply_central_kundrunda_to_store function
-- Allow authenticated users to execute the function

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.apply_central_kundrunda_to_store(uuid) TO authenticated;

-- Grant execute to anon role for public access if needed
GRANT EXECUTE ON FUNCTION public.apply_central_kundrunda_to_store(uuid) TO anon;
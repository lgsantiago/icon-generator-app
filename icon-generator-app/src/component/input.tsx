export function Input(props: React.ComponentPropsWithoutRef<"input">) {
  return (
    <input
      {...props}
      type="text"
      className="rounded border border-gray-800 px-4 py-2"
    ></input>
  );
}

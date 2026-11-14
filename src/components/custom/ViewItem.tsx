import React from "react";

function ViewItem({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <label className="block text-gray-600 text-sm font-bold">{title}</label>
      <p className="mt-1  w-full p-2  border rounded-lg ">{value}</p>
    </div>
  );
}

export default ViewItem;

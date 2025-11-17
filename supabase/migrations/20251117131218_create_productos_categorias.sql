-- Tabla para relacionar productos con múltiples categorías
CREATE TABLE IF NOT EXISTS public.productos_categorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  categoria_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT productos_categorias_pkey PRIMARY KEY (id),
  CONSTRAINT productos_categorias_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE,
  CONSTRAINT productos_categorias_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE,
  CONSTRAINT productos_categorias_unique UNIQUE (producto_id, categoria_id)
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_productos_categorias_producto ON public.productos_categorias(producto_id);
CREATE INDEX IF NOT EXISTS idx_productos_categorias_categoria ON public.productos_categorias(categoria_id);

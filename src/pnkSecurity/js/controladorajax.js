// JavaScript Document
// VUL013: todas las solicitudes que modifican el carrito envían el token
// anti-CSRF publicado por el servidor en <meta name="csrf-token">.

$(document).ready(function(){
   $('.button').click(function(e){
     e.preventDefault();
     agregaritems($(this).attr('id'));
   });

   $('.elim').click(function(e){
      e.preventDefault();
      eliminaritems($(this).attr('id'));
    });
    $('.limpiar').click(function(e){
      e.preventDefault();
      eliminartodo();
    });
 });

function tokenCsrf()
{
	return $('meta[name="csrf-token"]').attr('content');
}

function peticionCarrito(datos, alTerminar)
{
	$.ajax({
            type: "POST",
            url: 'carrito.php',
            data: datos,
            headers: { 'X-CSRF-Token': tokenCsrf() },
            dataType: 'json',
            success: alTerminar,
            error: function(xhr)
            {
				var msg = (xhr.responseJSON && xhr.responseJSON.error) ? xhr.responseJSON.error : 'No fue posible completar la operación.';
				alert(msg);
            }
       });
}

function agregaritems(id)
{
	peticionCarrito({ op: 1, iditems: id }, function(){
		$('#myModal').modal('show');
	});
}

function eliminaritems(pos)
{
	peticionCarrito({ op: 2, pos: pos }, function(){
		location.reload();
	});
}

function eliminartodo()
{
	peticionCarrito({ op: 3 }, function(){
		location.reload();
	});
}

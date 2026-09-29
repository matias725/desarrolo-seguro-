// JavaScript Document

$(document).ready(function(){
   $('.button').click(function(){
     agregaritems($(this).attr('id'));
   });

   $('.elim').click(function(){
      eliminaritems($(this).attr('id'));
    });
    $('.limpiar').click(function(){
      eliminartodo();
    });
 });

function agregaritems(id)
{
	$.ajax({
            type: "POST",
            url: 'carrito.php',
            data: "op=1&iditems="+id,
            success: function(response)
            {
				$('#myModal').modal('show');
            }
       });
}

function eliminaritems(pos)
{
	$.ajax({
            type: "POST",
            url: 'carrito.php',
            data: "op=2&pos="+pos,
            success: function(response)
            {
				location.reload();
            }
       });
}

function eliminartodo()
{
	$.ajax({
            type: "POST",
            url: 'carrito.php',
            data: "op=3",
            success: function(response)
            {
				location.reload();
            }
       });
}